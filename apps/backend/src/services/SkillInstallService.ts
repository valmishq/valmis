import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseSkillMarkdown } from '@repo/utils';
import { logger } from '../config/logger.js';
import { SkillService } from './SkillService.js';
import type { InstalledSkill, SkillInstallPreview, SkillScanFinding } from '@repo/types';

// ─── Limits (env-overridable) ─────────────────────────────────────────────────

const MAX_FILES = Number(process.env.SKILL_INSTALL_MAX_FILES ?? 30);
const MAX_TOTAL_BYTES = Number(process.env.SKILL_INSTALL_MAX_TOTAL_BYTES ?? 512 * 1024);
const MAX_FILE_BYTES = Number(process.env.SKILL_INSTALL_MAX_FILE_BYTES ?? 256 * 1024);
const MAX_SKILL_MD_BYTES = Number(process.env.SKILL_INSTALL_MAX_SKILLMD_BYTES ?? 64 * 1024);
const MAX_PATH_DEPTH = 5;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const EXCERPT_MAX_CHARS = 200;

/**
 * File-type policy. A comma-separated allowlist of file extensions
 * (SKILL_INSTALL_ALLOWED_FILE_EXT, default "md,txt"). Files whose extension is
 * not in the list are filtered out of the bundle (not a fatal error) and
 * reported to the user in the install preview. Binary files are always
 * rejected at blob fetch regardless of extension.
 *
 * `md` is always implicitly allowed — SKILL.md is structurally required, so a
 * config that omits it would make every skill un-installable.
 */
function parseAllowedExtensions(): Set<string> {
	const raw = process.env.SKILL_INSTALL_ALLOWED_FILE_EXT ?? 'md,txt';
	const exts = raw
		.split(',')
		.map((e) => e.trim().toLowerCase().replace(/^\./, '')) // normalize: strip leading dot
		.filter((e) => e.length > 0);
	exts.push('md'); // SKILL.md must always be installable
	return new Set(exts);
}

const ALLOWED_EXTENSIONS = parseAllowedExtensions();

// ─── Bundle integrity hash ────────────────────────────────────────────────────

/**
 * Canonical SHA-256 over a skill bundle: files sorted by path, each serialized
 * as `${path}\0${content}\0`. Computed at install time and re-verified by the
 * materializer before every workspace write.
 */
export function computeSkillBundleHash(files: Array<{ path: string; content: string }>): string {
	const hash = createHash('sha256');
	const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
	for (const file of sorted) {
		hash.update(file.path);
		hash.update('\0');
		hash.update(file.content);
		hash.update('\0');
	}
	return hash.digest('hex');
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** User-facing install failure — routes map this to a 422 with the message */
export class SkillInstallError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SkillInstallError';
	}
}

// ─── GitHub API response shapes (minimal) ─────────────────────────────────────

interface GitHubRepoResponse {
	default_branch: string;
}

interface GitHubCommitResponse {
	sha: string;
	commit: { tree: { sha: string } };
}

interface GitHubTreeEntry {
	path: string;
	mode: string;
	type: 'blob' | 'tree' | 'commit';
	sha: string;
	size?: number;
}

interface GitHubTreeResponse {
	tree: GitHubTreeEntry[];
	truncated: boolean;
}

interface GitHubBlobResponse {
	content: string;
	encoding: string;
	size: number;
}

// ─── Frontmatter validation ───────────────────────────────────────────────────

const skillFrontmatterSchema = z
	.object({
		name: z
			.string()
			.regex(
				/^[a-z0-9-]{1,64}$/,
				'name must be 1-64 chars of lowercase letters, digits, and hyphens',
			),
		description: z.string().min(10).max(1024),
		metadata: z
			.object({
				author: z.string().optional(),
				version: z.string().optional(),
				evolvable: z.boolean().optional(),
			})
			.loose()
			.optional(),
	})
	.loose();

// ─── Internal bundle shapes ───────────────────────────────────────────────────

interface BundleFile {
	path: string;
	content: string;
	size: number;
}

interface CachedPreview {
	ownerId: string;
	expiresAt: number;
	preview: SkillInstallPreview;
	files: BundleFile[];
	/** The original URL the user pasted — persisted as skills.source_url */
	sourceUrl: string;
}

interface ParsedRepoRef {
	owner: string;
	repo: string;
	/** ref extracted from a /tree/ URL — only used when no explicit ref is given */
	urlRef?: string;
	/** subpath extracted from a /tree/ URL — only used when no explicit subpath is given */
	urlSubpath?: string;
}

// ─── Heuristic scan rules ─────────────────────────────────────────────────────

interface ScanRule {
	rule: string;
	pattern: RegExp;
}

const SCAN_RULES: ScanRule[] = [
	{
		rule: 'prompt-injection-marker',
		pattern: /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
	},
	{ rule: 'prompt-injection-marker', pattern: /disregard[\s\S]{0,40}(system prompt|instructions)/i },
	{
		rule: 'prompt-injection-marker',
		pattern: /do not (tell|inform|reveal to|mention to) the user/i,
	},
	{ rule: 'covert-persona-switch', pattern: /you are now (?!able|ready)/i },
	{ rule: 'external-url', pattern: /https?:\/\/[^\s)'"<>\]]+/i },
	{ rule: 'base64-blob', pattern: /[A-Za-z0-9+/]{120,}={0,2}/ },
	{ rule: 'hex-blob', pattern: /(?:\\x[0-9a-fA-F]{2}){20,}/ },
	{ rule: 'env-var-access', pattern: /process\.env|os\.environ|\$\{?[A-Z_]{4,}\}?/ },
	{ rule: 'secret-keyword', pattern: /(api[_-]?key|secret|token|credential|password)/i },
	{ rule: 'pipe-to-shell', pattern: /(curl|wget)[^\n]*\|\s*(ba|z)?sh/ },
	{ rule: 'dynamic-eval', pattern: /\beval\s*\(/ },
	{ rule: 'base64-decode-exec', pattern: /base64\s+(-d|--decode)/ },
];

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Fetches, validates, scans, and installs skills from public GitHub
 * repositories following the Agent Skills open standard (SKILL.md).
 *
 * Security model (informed by the ClawHub malware campaign / Snyk
 * ToxicSkills / OWASP AST01):
 *   - Two-step install: preview (fetch + validate + scan, shown to the human)
 *     → confirm (persists EXACTLY the reviewed bundle from the server cache).
 *   - Files are fetched individually via the GitHub git/blobs API — no archive
 *     extraction, so zip-slip is structurally impossible. Paths are validated
 *     anyway before any workspace write.
 *   - Provenance pinned: resolved commit SHA + SHA-256 bundle hash; the
 *     materializer re-verifies the hash before every workspace write.
 *   - No auto-updates: updating a skill means re-installing (re-reviewing).
 */
export class SkillInstallService {
	private previewCache = new Map<string, CachedPreview>();

	constructor(private readonly skillService: SkillService) {
		// Periodic sweep of expired previews; unref so it never holds the process open
		const sweeper = setInterval(() => this.sweepExpiredPreviews(), 60_000);
		sweeper.unref();
	}

	// ─── Public API ─────────────────────────────────────────────────────────────

	/**
	 * Fetches and validates a skill from GitHub, runs the security scan, and
	 * caches the bundle server-side. Throws SkillInstallError on any block-level
	 * failure with a user-facing message.
	 */
	async preview(
		ownerId: string,
		repoUrl: string,
		subpath?: string,
		ref?: string,
	): Promise<SkillInstallPreview> {
		const parsed = this.parseRepoUrl(repoUrl);
		const effectiveRef = ref?.trim() || parsed.urlRef;
		const effectiveSubpath = this.normalizeSubpath(subpath?.trim() || parsed.urlSubpath || '');

		const sourceRepo = `${parsed.owner}/${parsed.repo}`;

		// 1. Resolve the ref to a pinned commit
		const resolvedRef = effectiveRef ?? (await this.getDefaultBranch(parsed.owner, parsed.repo));
		const commit = await this.githubGet<GitHubCommitResponse>(
			`/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(resolvedRef)}`,
			`Could not resolve ref "${resolvedRef}" in ${sourceRepo}`,
		);

		// 2. List the full tree at the pinned commit
		const tree = await this.githubGet<GitHubTreeResponse>(
			`/repos/${parsed.owner}/${parsed.repo}/git/trees/${commit.commit.tree.sha}?recursive=1`,
			`Could not list the file tree of ${sourceRepo}`,
		);
		if (tree.truncated) {
			throw new SkillInstallError(
				'Repository tree is too large to enumerate safely. Install from a smaller repository or point at a subdirectory of a fork.',
			);
		}

		// 3. Select + validate the bundle entries. Disallowed file types are
		//    filtered out (not fatal) and reported to the user in the preview.
		const { entries, filteredFiles } = this.selectBundleEntries(tree.tree, effectiveSubpath);

		// 4. Fetch blobs (text-only policy)
		const files = await this.fetchBundleFiles(parsed.owner, parsed.repo, entries, effectiveSubpath);

		// 5. Parse + validate SKILL.md frontmatter
		const skillMd = files.find((f) => f.path === 'SKILL.md');
		if (!skillMd) {
			throw new SkillInstallError(
				effectiveSubpath
					? `No SKILL.md found at "${effectiveSubpath}" in ${sourceRepo}.`
					: `No SKILL.md found at the repository root of ${sourceRepo}. If the skill lives in a subdirectory, specify the subdirectory.`,
			);
		}
		const parsedSkill = parseSkillMarkdown(skillMd.content);
		if (!parsedSkill) {
			throw new SkillInstallError(
				'SKILL.md is malformed: missing YAML frontmatter or required fields (name, description).',
			);
		}
		const fmResult = skillFrontmatterSchema.safeParse(parsedSkill.frontmatterRaw);
		if (!fmResult.success) {
			const issue = fmResult.error.issues[0];
			throw new SkillInstallError(
				`Invalid SKILL.md frontmatter: ${issue.path.join('.')} — ${issue.message}`,
			);
		}
		const frontmatter = fmResult.data;

		// 6. Name collision check (re-checked at confirm time)
		if (await this.skillService.isNameTaken(ownerId, frontmatter.name)) {
			throw new SkillInstallError(
				`A skill named "${frontmatter.name}" already exists (builtin or installed). Uninstall it first to replace it.`,
			);
		}

		// 7. Heuristic security scan (warn-level — surfaced for human review)
		const findings = this.scanBundle(files);

		// 8. Canonical content hash — the integrity pin
		const contentHash = computeSkillBundleHash(files);

		const preview: SkillInstallPreview = {
			previewId: randomUUID(),
			name: frontmatter.name,
			description: frontmatter.description,
			evolvable: frontmatter.metadata?.evolvable === true,
			frontmatter: parsedSkill.frontmatterRaw,
			skillMdContent: skillMd.content,
			files: files.map((f) => ({ path: f.path, size: f.size })),
			totalSize: files.reduce((sum, f) => sum + f.size, 0),
			filteredFiles,
			allowedExtensions: [...ALLOWED_EXTENSIONS],
			sourceRepo,
			sourceRef: effectiveRef,
			sourceSubpath: effectiveSubpath || undefined,
			commitSha: commit.sha,
			contentHash,
			findings,
		};

		this.previewCache.set(preview.previewId, {
			ownerId,
			expiresAt: Date.now() + PREVIEW_TTL_MS,
			preview,
			files,
			sourceUrl: repoUrl.trim(),
		});

		logger.info(
			{ ownerId, sourceRepo, commitSha: commit.sha, fileCount: files.length },
			'[skill-install] preview generated',
		);
		return preview;
	}

	/**
	 * Persists a previously previewed bundle. What the user reviewed is exactly
	 * what gets installed — the bundle comes from the server-side cache, never
	 * from the client.
	 */
	async confirm(previewId: string, ownerId: string): Promise<InstalledSkill> {
		const cached = this.previewCache.get(previewId);
		if (!cached || cached.expiresAt < Date.now()) {
			this.previewCache.delete(previewId);
			throw new SkillInstallError('Install preview expired — please fetch the skill again.');
		}
		if (cached.ownerId !== ownerId) {
			throw new SkillInstallError('Install preview does not belong to this user.');
		}

		// Re-check the collision invariant — the preview can be up to 10 minutes stale
		if (await this.skillService.isNameTaken(ownerId, cached.preview.name)) {
			throw new SkillInstallError(
				`A skill named "${cached.preview.name}" already exists. Uninstall it first to replace it.`,
			);
		}

		const installed = await this.skillService.installSkill({
			ownerId,
			name: cached.preview.name,
			description: cached.preview.description,
			frontmatter: cached.preview.frontmatter,
			evolvable: cached.preview.evolvable,
			sourceUrl: cached.sourceUrl,
			sourceRepo: cached.preview.sourceRepo,
			sourceRef: cached.preview.sourceRef,
			sourceSubpath: cached.preview.sourceSubpath,
			commitSha: cached.preview.commitSha,
			contentHash: cached.preview.contentHash,
			files: cached.files.map((f) => ({ path: f.path, content: f.content })),
		});

		this.previewCache.delete(previewId);
		logger.info(
			{ ownerId, skillId: installed.id, name: installed.name, commitSha: installed.commitSha },
			'[skill-install] skill installed',
		);
		return installed;
	}

	// ─── URL / path handling ────────────────────────────────────────────────────

	/**
	 * Accepts:
	 *   - https://github.com/{owner}/{repo}
	 *   - https://github.com/{owner}/{repo}/tree/{ref}/{subpath...}
	 *   - {owner}/{repo} shorthand (skills.sh convention)
	 */
	private parseRepoUrl(repoUrl: string): ParsedRepoRef {
		const trimmed = repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '');
		const segmentRe = /^[\w.-]+$/;

		// owner/repo shorthand
		const shorthand = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
		if (shorthand) {
			return { owner: shorthand[1], repo: shorthand[2] };
		}

		let url: URL;
		try {
			url = new URL(trimmed);
		} catch {
			throw new SkillInstallError(
				'Invalid repository URL. Use https://github.com/owner/repo or the owner/repo shorthand.',
			);
		}
		if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
			throw new SkillInstallError('Only github.com repositories are supported.');
		}

		const parts = url.pathname.split('/').filter(Boolean);
		if (parts.length < 2 || !segmentRe.test(parts[0]) || !segmentRe.test(parts[1])) {
			throw new SkillInstallError('Could not parse owner/repo from the URL.');
		}
		const ref: ParsedRepoRef = { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };

		// /tree/{ref}/{subpath...} form — auto-fill ref + subpath
		if (parts[2] === 'tree' && parts.length >= 4) {
			ref.urlRef = decodeURIComponent(parts[3]);
			if (parts.length > 4) {
				ref.urlSubpath = parts.slice(4).map(decodeURIComponent).join('/');
			}
		}
		return ref;
	}

	private normalizeSubpath(subpath: string): string {
		const normalized = subpath.replace(/^\/+|\/+$/g, '');
		if (normalized === '') return '';
		this.assertSafeRelativePath(normalized, 'subdirectory');
		return normalized;
	}

	/** Segment-level path validation — applied to subpath and every bundle file */
	private assertSafeRelativePath(relPath: string, label: string): void {
		const segments = relPath.split('/');
		if (segments.length > MAX_PATH_DEPTH) {
			throw new SkillInstallError(`${label} "${relPath}" exceeds max depth of ${MAX_PATH_DEPTH}.`);
		}
		for (const segment of segments) {
			if (!/^[A-Za-z0-9._-]+$/.test(segment) || segment === '..' || segment === '.') {
				throw new SkillInstallError(
					`${label} "${relPath}" contains an invalid path segment ("${segment}").`,
				);
			}
		}
	}

	// ─── GitHub fetch ───────────────────────────────────────────────────────────

	private async githubGet<T>(path: string, failureContext: string): Promise<T> {
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'OpenAgentIntegration-skill-install',
			'X-GitHub-Api-Version': '2022-11-28',
		};
		if (process.env.GITHUB_TOKEN) {
			headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
		}

		let response: Response;
		try {
			response = await fetch(`https://api.github.com${path}`, {
				headers,
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
		} catch (err) {
			logger.warn({ err, path }, '[skill-install] GitHub request failed');
			throw new SkillInstallError(`${failureContext}: GitHub request failed or timed out.`);
		}

		if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
			throw new SkillInstallError(
				'GitHub API rate limit exceeded. Set GITHUB_TOKEN in the server environment or try again later.',
			);
		}
		if (response.status === 404) {
			throw new SkillInstallError(`${failureContext}: not found (is the repository public?).`);
		}
		if (!response.ok) {
			throw new SkillInstallError(`${failureContext}: GitHub returned HTTP ${response.status}.`);
		}
		return (await response.json()) as T;
	}

	private async getDefaultBranch(owner: string, repo: string): Promise<string> {
		const repoInfo = await this.githubGet<GitHubRepoResponse>(
			`/repos/${owner}/${repo}`,
			`Could not access repository ${owner}/${repo}`,
		);
		return repoInfo.default_branch;
	}

	/**
	 * Filters tree entries to the subpath and enforces all structural gates.
	 * Files with a disallowed type are NOT fatal — they are excluded from the
	 * bundle and returned in filteredFiles so the user is told at review time.
	 * Caps (file count, sizes) apply to the retained files only; filtered files
	 * are never fetched, hashed, or installed.
	 */
	private selectBundleEntries(
		entries: GitHubTreeEntry[],
		subpath: string,
	): { entries: Array<GitHubTreeEntry & { relativePath: string }>; filteredFiles: string[] } {
		const prefix = subpath === '' ? '' : `${subpath}/`;

		const selected: Array<GitHubTreeEntry & { relativePath: string }> = [];
		const filteredFiles: string[] = [];
		let totalBytes = 0;

		for (const entry of entries) {
			if (subpath !== '' && !entry.path.startsWith(prefix)) continue;
			const relativePath = subpath === '' ? entry.path : entry.path.slice(prefix.length);
			if (relativePath === '') continue;

			if (entry.mode === '120000') {
				throw new SkillInstallError(`Bundle contains a symlink ("${relativePath}") — rejected.`);
			}
			if (entry.mode === '160000' || entry.type === 'commit') {
				throw new SkillInstallError(`Bundle contains a git submodule ("${relativePath}") — rejected.`);
			}
			if (entry.type !== 'blob') continue;

			// Type filter BEFORE path/size validation — a filtered file is never
			// installed, so a weird path or oversize in it must not block the install.
			if (!this.isAllowedFileType(relativePath)) {
				filteredFiles.push(relativePath);
				continue;
			}

			this.assertSafeRelativePath(relativePath, 'File path');

			const size = entry.size ?? 0;
			if (size > MAX_FILE_BYTES) {
				throw new SkillInstallError(
					`File "${relativePath}" is ${size} bytes — exceeds the per-file limit of ${MAX_FILE_BYTES} bytes.`,
				);
			}
			if (relativePath === 'SKILL.md' && size > MAX_SKILL_MD_BYTES) {
				throw new SkillInstallError(
					`SKILL.md is ${size} bytes — exceeds the limit of ${MAX_SKILL_MD_BYTES} bytes.`,
				);
			}

			totalBytes += size;
			selected.push({ ...entry, relativePath });
		}

		if (selected.length === 0) {
			throw new SkillInstallError(
				filteredFiles.length > 0
					? `No installable files found — all ${filteredFiles.length} files were filtered out. Allowed file types: ${[...ALLOWED_EXTENSIONS].map((e) => `.${e}`).join(', ')}.`
					: 'No files found at the given location.',
			);
		}
		if (selected.length > MAX_FILES) {
			throw new SkillInstallError(
				`Bundle has ${selected.length} files — exceeds the limit of ${MAX_FILES}. Point at the skill's subdirectory instead of the whole repository.`,
			);
		}
		if (totalBytes > MAX_TOTAL_BYTES) {
			throw new SkillInstallError(
				`Bundle is ${totalBytes} bytes — exceeds the total limit of ${MAX_TOTAL_BYTES} bytes.`,
			);
		}

		const skillMdCount = selected.filter((e) => e.relativePath === 'SKILL.md').length;
		if (skillMdCount !== 1) {
			throw new SkillInstallError(
				subpath === ''
					? 'Repository root must contain exactly one SKILL.md. If the skill lives in a subdirectory, specify the subdirectory.'
					: `"${subpath}" must contain exactly one SKILL.md.`,
			);
		}

		return { entries: selected, filteredFiles };
	}

	/**
	 * Active file-type policy: the file's extension (without leading dot) must
	 * be in SKILL_INSTALL_ALLOWED_FILE_EXT (default "md,txt"). Extensionless
	 * files are never allowed.
	 */
	private isAllowedFileType(relativePath: string): boolean {
		const fileName = relativePath.split('/').pop() ?? relativePath;
		const dotIndex = fileName.lastIndexOf('.');
		if (dotIndex < 0) return false;
		const extension = fileName.slice(dotIndex + 1).toLowerCase();
		return ALLOWED_EXTENSIONS.has(extension);
	}

	private async fetchBundleFiles(
		owner: string,
		repo: string,
		entries: Array<GitHubTreeEntry & { relativePath: string }>,
		subpath: string,
	): Promise<BundleFile[]> {
		const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
		const files: BundleFile[] = [];

		for (const entry of entries) {
			const blob = await this.githubGet<GitHubBlobResponse>(
				`/repos/${owner}/${repo}/git/blobs/${entry.sha}`,
				`Could not fetch file "${entry.relativePath}"`,
			);
			if (blob.encoding !== 'base64') {
				throw new SkillInstallError(
					`Unexpected blob encoding "${blob.encoding}" for "${entry.relativePath}".`,
				);
			}
			const buffer = Buffer.from(blob.content, 'base64');
			if (buffer.includes(0)) {
				throw new SkillInstallError(
					`File "${entry.relativePath}" appears to be binary (contains NUL bytes) — only text files are supported.`,
				);
			}
			let content: string;
			try {
				content = utf8Decoder.decode(buffer);
			} catch {
				throw new SkillInstallError(
					`File "${entry.relativePath}" is not valid UTF-8 — only text files are supported.`,
				);
			}
			files.push({ path: entry.relativePath, content, size: buffer.length });
		}

		logger.debug(
			{ owner, repo, subpath, fileCount: files.length },
			'[skill-install] bundle fetched',
		);
		return files;
	}

	// ─── Security scan ──────────────────────────────────────────────────────────

	/**
	 * Heuristic content scan. Findings are warn-level — they are surfaced to the
	 * human reviewer rather than silently blocking, because legitimate skills
	 * routinely mention URLs, API keys, etc. One finding per (rule, file) to
	 * keep the review readable.
	 */
	private scanBundle(files: BundleFile[]): SkillScanFinding[] {
		const findings: SkillScanFinding[] = [];

		for (const file of files) {
			const seenRules = new Set<string>();
			const lines = file.content.split('\n');
			for (const { rule, pattern } of SCAN_RULES) {
				if (seenRules.has(rule)) continue;
				for (let i = 0; i < lines.length; i++) {
					const match = lines[i].match(pattern);
					if (match) {
						seenRules.add(rule);
						findings.push({
							severity: 'warn',
							rule,
							file: file.path,
							line: i + 1,
							excerpt: match[0].slice(0, EXCERPT_MAX_CHARS),
						});
						break;
					}
				}
			}
		}

		return findings;
	}

	// ─── Cache maintenance ──────────────────────────────────────────────────────

	private sweepExpiredPreviews(): void {
		const now = Date.now();
		for (const [id, cached] of this.previewCache) {
			if (cached.expiresAt < now) this.previewCache.delete(id);
		}
	}
}
