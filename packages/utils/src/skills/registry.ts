import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { SkillCatalogEntry } from '@repo/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the skills directory relative to the package root (packages/utils/).
// Go up 2 levels from src/skills/ (or dist/skills/) to reach packages/utils/,
// then descend into src/skills/ where the SKILL.md files live.
// tsc does not copy .md files, so we always point at the src/ tree regardless of
// whether the compiled dist/ or the source src/ version of this file is running.
const SKILLS_DIR = path.resolve(__dirname, '../../src/skills');

/** In-memory cache of all parsed skill catalog entries */
let catalogCache: SkillCatalogEntry[] | null = null;

/**
 * Shape of the SKILL.md YAML frontmatter after parsing.
 * Only the fields we care about are typed here.
 */
interface SkillFrontmatter {
	name: string;
	description: string;
	metadata?: {
		evolvable?: boolean;
		[key: string]: unknown;
	};
}

/** Result of parsing a SKILL.md document */
export interface ParsedSkillMarkdown {
	frontmatter: SkillFrontmatter;
	/** Raw YAML frontmatter as a generic record (all fields preserved) */
	frontmatterRaw: Record<string, unknown>;
	body: string;
}

/**
 * Parses SKILL.md content and extracts YAML frontmatter + body.
 * Returns null if the document is malformed or missing required fields.
 * Exported so installed skills (stored in the DB) can be parsed with the
 * exact same rules as builtin skills.
 */
export function parseSkillMarkdown(content: string): ParsedSkillMarkdown | null {
	// YAML frontmatter is delimited by --- ... ---
	const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!fmMatch) return null;

	const rawYaml = fmMatch[1];
	const body = fmMatch[2].trim();

	const parsed = yaml.load(rawYaml);
	if (!parsed || typeof parsed !== 'object') return null;

	const fm = parsed as Record<string, unknown>;
	if (typeof fm['name'] !== 'string' || typeof fm['description'] !== 'string') return null;

	return {
		frontmatter: parsed as SkillFrontmatter,
		frontmatterRaw: fm,
		body,
	};
}

/**
 * Replaces the markdown body of a SKILL.md document while keeping the
 * frontmatter intact. Used by the materializer to substitute evolved
 * instructions. Returns null if the document has no valid frontmatter block.
 */
export function replaceSkillMarkdownBody(content: string, newBody: string): string | null {
	const fmMatch = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)[\s\S]*$/);
	if (!fmMatch) return null;
	return `${fmMatch[1]}\n${newBody.trim()}\n`;
}

/**
 * Parses a SKILL.md file and extracts YAML frontmatter + body content.
 * Returns null if the file is malformed or missing required fields.
 */
function parseSkillFile(filePath: string): ParsedSkillMarkdown | null {
	const content = fs.readFileSync(filePath, 'utf-8');
	return parseSkillMarkdown(content);
}

/**
 * Loads all skills from the skills/ subdirectories.
 * Each skill directory must contain a SKILL.md file with valid YAML frontmatter.
 * Results are cached in memory after the first load.
 */
export function loadSkillCatalog(): SkillCatalogEntry[] {
	if (catalogCache) return catalogCache;

	const entries: SkillCatalogEntry[] = [];

	let dirs: string[];
	try {
		dirs = fs
			.readdirSync(SKILLS_DIR, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
	} catch {
		return [];
	}

	for (const dir of dirs) {
		const skillMdPath = path.join(SKILLS_DIR, dir, 'SKILL.md');
		if (!fs.existsSync(skillMdPath)) continue;

		const parsed = parseSkillFile(skillMdPath);
		if (!parsed) {
			console.warn(`[skills-registry] Could not parse SKILL.md in ${dir} — skipping`);
			continue;
		}

		const { frontmatter } = parsed;

		// Validate that the name field matches the directory name
		if (frontmatter.name !== dir) {
			console.warn(
				`[skills-registry] Skill name "${frontmatter.name}" does not match directory "${dir}" — skipping`,
			);
			continue;
		}

		entries.push({
			name: frontmatter.name,
			description: frontmatter.description,
			evolvable: frontmatter.metadata?.evolvable === true,
			source: 'builtin',
		});
	}

	catalogCache = entries;
	return entries;
}

/**
 * Returns the Markdown body (instructions) from a skill's SKILL.md file.
 * Returns null if the skill is not found or the file is malformed.
 */
export function getSkillInstructions(skillName: string): string | null {
	const skillMdPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
	if (!fs.existsSync(skillMdPath)) return null;

	const parsed = parseSkillFile(skillMdPath);
	return parsed?.body ?? null;
}

/**
 * Returns a single skill catalog entry by name.
 */
export function getSkillCatalogEntry(skillName: string): SkillCatalogEntry | undefined {
	return loadSkillCatalog().find((s) => s.name === skillName);
}

/**
 * Returns the full raw SKILL.md content (frontmatter + body) for a builtin skill.
 * Used by the materializer to write the file verbatim into agent workspaces.
 * Returns null if the skill is not found.
 */
export function getSkillRawFile(skillName: string): string | null {
	const skillMdPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
	if (!fs.existsSync(skillMdPath)) return null;
	return fs.readFileSync(skillMdPath, 'utf-8');
}

/** A bundled skill file with its path relative to the skill directory */
export interface SkillBundleFile {
	path: string;
	content: string;
}

/**
 * Returns all files bundled with a builtin skill (SKILL.md plus any
 * references/scripts/assets), with paths relative to the skill directory.
 * Symlinks are skipped (lstat check) so a symlinked file can never leak
 * content from outside the skill directory. Returns [] if the skill is
 * not found.
 */
export function getSkillBundleFiles(skillName: string): SkillBundleFile[] {
	const skillDir = path.join(SKILLS_DIR, skillName);
	if (!fs.existsSync(skillDir)) return [];

	const files: SkillBundleFile[] = [];

	const walk = (dir: string): void => {
		let dirents: fs.Dirent[];
		try {
			dirents = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const dirent of dirents) {
			const fullPath = path.join(dir, dirent.name);
			// lstat so symlinks are detected as symlinks, not their targets
			const stat = fs.lstatSync(fullPath);
			if (stat.isSymbolicLink()) continue;
			if (stat.isDirectory()) {
				walk(fullPath);
			} else if (stat.isFile()) {
				files.push({
					path: path.relative(skillDir, fullPath),
					content: fs.readFileSync(fullPath, 'utf-8'),
				});
			}
		}
	};

	walk(skillDir);
	return files;
}

/**
 * Clears the in-memory catalog cache. Useful for testing or hot-reload scenarios.
 */
export function clearSkillCatalogCache(): void {
	catalogCache = null;
}
