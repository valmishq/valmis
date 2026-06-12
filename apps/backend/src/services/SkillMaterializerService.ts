import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { getSkillBundleFiles, replaceSkillMarkdownBody } from '@repo/utils';
import { logger } from '../config/logger.js';
import { SkillService } from './SkillService.js';
import { computeSkillBundleHash } from './SkillInstallService.js';
import type { SkillCatalogEntry, SkillRuntimeEntry } from '@repo/types';

/**
 * Materializes an agent's assigned skills into its workspace before each
 * spawn (progressive disclosure: the system prompt only carries a compact
 * index; the agent reads <workspace>/skills/<name>/SKILL.md on demand via
 * read_file).
 *
 * Integrity model:
 *   - The skills/ directory is deleted and rewritten FRESH on every spawn, so
 *     any tampering by the agent in a previous turn cannot persist.
 *   - Installed skills are hash-verified against skills.content_hash before
 *     writing — a mismatch (DB tampering) skips the skill with an error log.
 *   - Evolved instructions (agent_evolved_skills) replace the SKILL.md body
 *     while keeping the frontmatter intact.
 */
export class SkillMaterializerService {
	constructor(private readonly skillService: SkillService) {}

	/**
	 * Rewrites <workspacePath>/skills/ from scratch and returns the runtime
	 * index. A skill that fails to materialize is logged and omitted — it must
	 * never fail the whole turn.
	 */
	async materializeForAgent(agentId: string, workspacePath: string): Promise<SkillRuntimeEntry[]> {
		const skillsDir = join(workspacePath, 'skills');

		const entries = await this.skillService.getAgentSkillEntries(agentId);

		// Always reset — also removes folders of skills that were unassigned
		rmSync(skillsDir, { recursive: true, force: true });
		if (entries.length === 0) return [];

		mkdirSync(skillsDir, { recursive: true, mode: 0o755 });

		const runtimeEntries: SkillRuntimeEntry[] = [];
		for (const entry of entries) {
			try {
				const files = await this.loadSkillFiles(entry);
				if (!files) continue;

				const resolved = await this.applyEvolvedInstructions(agentId, entry.name, files);
				this.writeSkillFiles(skillsDir, entry.name, resolved);

				runtimeEntries.push({
					name: entry.name,
					description: entry.description,
					path: `skills/${entry.name}/SKILL.md`,
				});
			} catch (err) {
				logger.warn(
					{ err, agentId, skillName: entry.name },
					'[skill-materializer] failed to materialize skill — omitting from this turn',
				);
			}
		}

		logger.debug(
			{ agentId, skillCount: runtimeEntries.length },
			'[skill-materializer] workspace skills materialized',
		);
		return runtimeEntries;
	}

	/**
	 * Loads the file bundle for a skill. Returns null (with a log) when the
	 * skill cannot be loaded or fails integrity verification.
	 */
	private async loadSkillFiles(
		entry: SkillCatalogEntry,
	): Promise<Array<{ path: string; content: string }> | null> {
		if (entry.source === 'builtin') {
			const files = getSkillBundleFiles(entry.name);
			if (files.length === 0) {
				logger.warn(
					{ skillName: entry.name },
					'[skill-materializer] builtin skill has no files — skipping',
				);
				return null;
			}
			return files;
		}

		if (!entry.skillId) return null;
		const skill = await this.skillService.getInstalledByIdInternal(entry.skillId);
		if (!skill) return null;

		const files = await this.skillService.getInstalledFiles(entry.skillId);
		if (files.length === 0) return null;

		// Integrity verification — stored content must match the hash pinned at
		// install time. A mismatch means the DB rows were modified outside the
		// reviewed install flow.
		const actualHash = computeSkillBundleHash(files);
		if (actualHash !== skill.contentHash) {
			logger.error(
				{ skillId: entry.skillId, skillName: entry.name, expected: skill.contentHash, actualHash },
				'[skill-materializer] content hash mismatch — possible tampering, skipping skill',
			);
			return null;
		}

		return files.map((f) => ({ path: f.path, content: f.content }));
	}

	/**
	 * Replaces the SKILL.md body with the agent's evolved instructions when an
	 * evolved record exists (evolved > base precedence). Frontmatter is kept so
	 * name/description survive.
	 */
	private async applyEvolvedInstructions(
		agentId: string,
		skillName: string,
		files: Array<{ path: string; content: string }>,
	): Promise<Array<{ path: string; content: string }>> {
		const evolved = await this.skillService.getEvolvedSkill(agentId, skillName);
		if (!evolved) return files;

		return files.map((file) => {
			if (file.path !== 'SKILL.md') return file;
			const replaced = replaceSkillMarkdownBody(file.content, evolved.evolvedInstructions);
			if (!replaced) {
				logger.warn(
					{ agentId, skillName },
					'[skill-materializer] could not substitute evolved instructions — using base SKILL.md',
				);
				return file;
			}
			return { path: file.path, content: replaced };
		});
	}

	/** Writes a skill's files under skills/<name>/ with a path traversal guard */
	private writeSkillFiles(
		skillsDir: string,
		skillName: string,
		files: Array<{ path: string; content: string }>,
	): void {
		const skillDir = join(skillsDir, skillName);
		mkdirSync(skillDir, { recursive: true, mode: 0o755 });

		for (const file of files) {
			const target = this.resolveWithinDir(skillDir, file.path);
			mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
			writeFileSync(target, file.content, { mode: 0o644 });
		}
	}

	/**
	 * Separator-aware containment check (same approach as resolveWorkspacePath
	 * in the agent runtime) — "skills/abc" must not match "skills/abc-evil".
	 */
	private resolveWithinDir(baseDir: string, relativePath: string): string {
		const resolved = resolve(baseDir, relativePath);
		const baseWithSep = baseDir.endsWith(sep) ? baseDir : baseDir + sep;
		if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) {
			throw new Error(`Skill file path escapes its directory: ${relativePath}`);
		}
		return resolved;
	}
}
