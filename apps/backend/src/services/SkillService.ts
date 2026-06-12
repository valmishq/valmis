import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
	agentSkills,
	agentEvolvedSkills,
	agentExecutionTraces,
	skills,
	skillFiles,
} from '../db/schema/index.js';
import {
	loadSkillCatalog,
	getSkillInstructions,
	getSkillCatalogEntry,
	parseSkillMarkdown,
} from '@repo/utils';
import { logger } from '../config/logger.js';
import type {
	SkillCatalogEntry,
	SkillSource,
	AgentEvolvedSkill,
	AgentSkillAssignment,
	InstalledSkill,
	InstalledSkillFile,
} from '@repo/types';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface RecordTraceInput {
	agentId: string;
	skillName: string;
	success: boolean;
	toolCallCount?: number;
	executionLog?: Record<string, unknown>;
}

/** Validated bundle persisted by installSkill() (built by SkillInstallService) */
export interface InstallSkillInput {
	ownerId: string;
	name: string;
	description: string;
	frontmatter: Record<string, unknown>;
	evolvable: boolean;
	sourceUrl: string;
	sourceRepo: string;
	sourceRef?: string;
	sourceSubpath?: string;
	commitSha: string;
	contentHash: string;
	files: Array<{ path: string; content: string }>;
}

/** One agent_skills row — carries the source discriminator for resolution */
export interface AgentSkillAssignmentRow {
	agentId: string;
	skillName: string;
	source: SkillSource;
	skillId: string | null;
}

// ─── Row Mapping ──────────────────────────────────────────────────────────────

type SkillRow = typeof skills.$inferSelect;

function toInstalledSkill(row: SkillRow): InstalledSkill {
	return {
		id: row.id,
		ownerId: row.ownerId,
		name: row.name,
		description: row.description,
		evolvable: row.evolvable,
		frontmatter: row.frontmatter,
		sourceUrl: row.sourceUrl,
		sourceRepo: row.sourceRepo,
		sourceRef: row.sourceRef ?? undefined,
		sourceSubpath: row.sourceSubpath ?? undefined,
		commitSha: row.commitSha,
		contentHash: row.contentHash,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toCatalogEntry(row: SkillRow): SkillCatalogEntry {
	return {
		name: row.name,
		description: row.description,
		evolvable: row.evolvable,
		source: 'installed',
		skillId: row.id,
		sourceRepo: row.sourceRepo,
	};
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Service for skill catalog access, installed skill storage, and agent skill
 * management.
 *
 * Skill resolution priority (spec §5):
 *   1. agent_evolved_skills record for this agent+skill → use evolvedInstructions
 *   2. Fallback to the base SKILL.md body (codebase for builtin, skill_files
 *      for installed)
 */
export class SkillService {
	/**
	 * Returns the merged skill catalog for an owner:
	 * builtin skills from the codebase registry + the owner's installed skills.
	 */
	async getCatalog(ownerId: string): Promise<SkillCatalogEntry[]> {
		const builtins = loadSkillCatalog();
		const installedRows = await db.select().from(skills).where(eq(skills.ownerId, ownerId));
		return [...builtins, ...installedRows.map(toCatalogEntry)];
	}

	/**
	 * Returns true if a skill name is already taken for this owner —
	 * either by a builtin skill or one of the owner's installed skills.
	 * Comparison is case-insensitive.
	 */
	async isNameTaken(ownerId: string, name: string): Promise<boolean> {
		const lower = name.toLowerCase();
		const builtinTaken = loadSkillCatalog().some((s) => s.name.toLowerCase() === lower);
		if (builtinTaken) return true;

		const rows = await db
			.select({ id: skills.id })
			.from(skills)
			.where(and(eq(skills.ownerId, ownerId), sql`lower(${skills.name}) = ${lower}`))
			.limit(1);
		return rows.length > 0;
	}

	/**
	 * Resolves the instructions to load for a given agent+skill.
	 * Checks agent_evolved_skills first, falls back to the base SKILL.md body.
	 * Returns null if the skill cannot be resolved.
	 */
	async getSkillInstructions(agentId: string, skillName: string): Promise<string | null> {
		// Check for an agent-specific evolved override first
		const evolved = await this.getEvolvedSkill(agentId, skillName);
		if (evolved) return evolved.evolvedInstructions;

		return this.getBaseInstructions(agentId, skillName);
	}

	/**
	 * Returns the un-evolved (base) SKILL.md body for an assigned skill —
	 * codebase registry for builtins, skill_files for installed skills.
	 */
	async getBaseInstructions(agentId: string, skillName: string): Promise<string | null> {
		const assignment = await this.getAssignment(agentId, skillName);
		if (!assignment || assignment.source === 'builtin') {
			return getSkillInstructions(skillName);
		}
		if (!assignment.skillId) return null;

		const skillMd = await this.getInstalledSkillMd(assignment.skillId);
		if (!skillMd) return null;
		return parseSkillMarkdown(skillMd)?.body ?? null;
	}

	/** List skill names assigned to an agent */
	async getAgentSkills(agentId: string): Promise<string[]> {
		const rows = await db
			.select({ skillName: agentSkills.skillName })
			.from(agentSkills)
			.where(eq(agentSkills.agentId, agentId));
		return rows.map((r) => r.skillName);
	}

	/** List full assignment rows (with source + skillId) for an agent */
	async getAgentSkillAssignments(agentId: string): Promise<AgentSkillAssignmentRow[]> {
		const rows = await db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId));
		return rows.map((r) => ({
			agentId: r.agentId,
			skillName: r.skillName,
			source: r.source === 'installed' ? 'installed' : 'builtin',
			skillId: r.skillId,
		}));
	}

	/**
	 * Resolves the assigned skills of an agent against the catalog.
	 * Skills that no longer resolve (deleted from codebase, stale rows) are
	 * skipped with a warning — a stale assignment must never break a spawn.
	 */
	async getAgentSkillEntries(agentId: string): Promise<SkillCatalogEntry[]> {
		const assignments = await this.getAgentSkillAssignments(agentId);
		if (assignments.length === 0) return [];

		const entries: SkillCatalogEntry[] = [];
		const installedIds = assignments
			.filter((a) => a.source === 'installed' && a.skillId)
			.map((a) => a.skillId as string);

		const installedRows =
			installedIds.length > 0
				? await db.select().from(skills).where(inArray(skills.id, installedIds))
				: [];
		const installedById = new Map(installedRows.map((r) => [r.id, r]));

		for (const assignment of assignments) {
			if (assignment.source === 'builtin') {
				const entry = getSkillCatalogEntry(assignment.skillName);
				if (entry) {
					entries.push(entry);
				} else {
					logger.warn(
						{ agentId, skillName: assignment.skillName },
						'[skills] assigned builtin skill no longer in catalog — skipping',
					);
				}
				continue;
			}

			const row = assignment.skillId ? installedById.get(assignment.skillId) : undefined;
			if (row) {
				entries.push(toCatalogEntry(row));
			} else {
				logger.warn(
					{ agentId, skillName: assignment.skillName },
					'[skills] assigned installed skill no longer exists — skipping',
				);
			}
		}

		return entries;
	}

	/** Returns a single assignment row, or null */
	async getAssignment(agentId: string, skillName: string): Promise<AgentSkillAssignmentRow | null> {
		const rows = await db
			.select()
			.from(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillName, skillName)))
			.limit(1);
		if (!rows[0]) return null;
		return {
			agentId: rows[0].agentId,
			skillName: rows[0].skillName,
			source: rows[0].source === 'installed' ? 'installed' : 'builtin',
			skillId: rows[0].skillId,
		};
	}

	/**
	 * Assigns a skill to an agent.
	 * Validates that the skill exists in the merged catalog (builtin or one of
	 * the owner's installed skills) before inserting.
	 * No-op if already assigned (idempotent).
	 */
	async assignSkill(
		agentId: string,
		skillName: string,
		ownerId: string,
	): Promise<AgentSkillAssignment | null> {
		// Builtin first — install-time collision checks guarantee uniqueness
		const builtin = getSkillCatalogEntry(skillName);
		if (builtin) {
			await db
				.insert(agentSkills)
				.values({ agentId, skillName, source: 'builtin', skillId: null })
				.onConflictDoNothing();
			return { agentId, skillName };
		}

		const installed = await this.getInstalledByName(ownerId, skillName);
		if (!installed) return null;

		await db
			.insert(agentSkills)
			.values({ agentId, skillName, source: 'installed', skillId: installed.id })
			.onConflictDoNothing();
		return { agentId, skillName };
	}

	/**
	 * Removes a skill assignment from an agent.
	 * Returns true if a row was deleted, false if none found.
	 */
	async removeSkill(agentId: string, skillName: string): Promise<boolean> {
		const result = await db
			.delete(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillName, skillName)));
		return (result.rowCount ?? 0) > 0;
	}

	// ─── Installed Skills ─────────────────────────────────────────────────────

	/** Lists all skills installed by an owner */
	async listInstalled(ownerId: string): Promise<InstalledSkill[]> {
		const rows = await db.select().from(skills).where(eq(skills.ownerId, ownerId));
		return rows.map(toInstalledSkill);
	}

	/** Ownership-checked fetch of a single installed skill */
	async getInstalledById(id: string, ownerId: string): Promise<InstalledSkill | null> {
		const rows = await db
			.select()
			.from(skills)
			.where(and(eq(skills.id, id), eq(skills.ownerId, ownerId)))
			.limit(1);
		return rows[0] ? toInstalledSkill(rows[0]) : null;
	}

	/**
	 * Internal fetch without ownership check — used by the materializer, which
	 * is already scoped by the agent's ownership of the assignment row.
	 */
	async getInstalledByIdInternal(id: string): Promise<InstalledSkill | null> {
		const rows = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
		return rows[0] ? toInstalledSkill(rows[0]) : null;
	}

	/** Fetch an installed skill by owner + name */
	async getInstalledByName(ownerId: string, name: string): Promise<InstalledSkill | null> {
		const rows = await db
			.select()
			.from(skills)
			.where(and(eq(skills.ownerId, ownerId), eq(skills.name, name)))
			.limit(1);
		return rows[0] ? toInstalledSkill(rows[0]) : null;
	}

	/** All bundle files of an installed skill */
	async getInstalledFiles(skillId: string): Promise<InstalledSkillFile[]> {
		const rows = await db.select().from(skillFiles).where(eq(skillFiles.skillId, skillId));
		return rows.map((r) => ({ path: r.path, size: r.size, content: r.content }));
	}

	/** The raw SKILL.md content of an installed skill, or null */
	async getInstalledSkillMd(skillId: string): Promise<string | null> {
		const rows = await db
			.select()
			.from(skillFiles)
			.where(and(eq(skillFiles.skillId, skillId), eq(skillFiles.path, 'SKILL.md')))
			.limit(1);
		return rows[0]?.content ?? null;
	}

	/**
	 * Persists a validated skill bundle (skills row + skill_files rows) in one
	 * transaction. Caller (SkillInstallService) is responsible for all
	 * validation, scanning, and collision checks.
	 */
	async installSkill(input: InstallSkillInput): Promise<InstalledSkill> {
		const row = await db.transaction(async (tx) => {
			const inserted = await tx
				.insert(skills)
				.values({
					ownerId: input.ownerId,
					name: input.name,
					description: input.description,
					frontmatter: input.frontmatter,
					evolvable: input.evolvable,
					sourceUrl: input.sourceUrl,
					sourceRepo: input.sourceRepo,
					sourceRef: input.sourceRef ?? null,
					sourceSubpath: input.sourceSubpath ?? null,
					commitSha: input.commitSha,
					contentHash: input.contentHash,
				})
				.returning();

			const skillRow = inserted[0];
			if (input.files.length > 0) {
				await tx.insert(skillFiles).values(
					input.files.map((f) => ({
						skillId: skillRow.id,
						path: f.path,
						content: f.content,
						size: Buffer.byteLength(f.content, 'utf-8'),
					})),
				);
			}
			return skillRow;
		});

		return toInstalledSkill(row);
	}

	/**
	 * Deletes an installed skill. skill_files and agent_skills rows cascade via
	 * FK; agent_evolved_skills rows (keyed by name, not FK) are cleaned up
	 * explicitly for the agents that had the skill assigned.
	 * Returns null if the skill does not exist or is not owned by ownerId.
	 */
	async deleteInstalled(
		id: string,
		ownerId: string,
	): Promise<{ deleted: boolean; unassignedAgentCount: number } | null> {
		const skill = await this.getInstalledById(id, ownerId);
		if (!skill) return null;

		return db.transaction(async (tx) => {
			const assignedRows = await tx
				.select({ agentId: agentSkills.agentId })
				.from(agentSkills)
				.where(eq(agentSkills.skillId, id));
			const agentIds = assignedRows.map((r) => r.agentId);

			if (agentIds.length > 0) {
				await tx
					.delete(agentEvolvedSkills)
					.where(
						and(
							inArray(agentEvolvedSkills.agentId, agentIds),
							eq(agentEvolvedSkills.skillName, skill.name),
						),
					);
			}

			// Cascades skill_files + agent_skills
			await tx.delete(skills).where(eq(skills.id, id));

			return { deleted: true, unassignedAgentCount: agentIds.length };
		});
	}

	// ─── Evolved Skills ───────────────────────────────────────────────────────

	/**
	 * Returns the agent-specific evolved skill record for a given agent+skill pair.
	 * Returns null if no evolved override exists.
	 */
	async getEvolvedSkill(agentId: string, skillName: string): Promise<AgentEvolvedSkill | null> {
		const rows = await db
			.select()
			.from(agentEvolvedSkills)
			.where(
				and(eq(agentEvolvedSkills.agentId, agentId), eq(agentEvolvedSkills.skillName, skillName)),
			)
			.limit(1);

		if (!rows[0]) return null;
		return this.toEvolvedSkill(rows[0]);
	}

	/** All evolved skill records for an agent (one query for the edit page) */
	async getEvolvedSkills(agentId: string): Promise<AgentEvolvedSkill[]> {
		const rows = await db
			.select()
			.from(agentEvolvedSkills)
			.where(eq(agentEvolvedSkills.agentId, agentId));
		return rows.map((r) => this.toEvolvedSkill(r));
	}

	/**
	 * Inserts or bumps the evolved instructions for an agent+skill pair.
	 * Version increments on every update. Called by the evolution engine.
	 */
	async upsertEvolvedSkill(
		agentId: string,
		skillName: string,
		evolvedInstructions: string,
	): Promise<AgentEvolvedSkill> {
		const rows = await db
			.insert(agentEvolvedSkills)
			.values({ agentId, skillName, evolvedInstructions, version: 1 })
			.onConflictDoUpdate({
				target: [agentEvolvedSkills.agentId, agentEvolvedSkills.skillName],
				set: {
					evolvedInstructions,
					version: sql`${agentEvolvedSkills.version} + 1`,
					updatedAt: sql`now()`,
				},
			})
			.returning();
		return this.toEvolvedSkill(rows[0]);
	}

	private toEvolvedSkill(row: typeof agentEvolvedSkills.$inferSelect): AgentEvolvedSkill {
		return {
			id: row.id,
			agentId: row.agentId,
			skillName: row.skillName,
			evolvedInstructions: row.evolvedInstructions,
			version: row.version,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}

	// ─── Execution Traces ─────────────────────────────────────────────────────

	/**
	 * Records a skill execution trace for the evolution engine.
	 * Called by the agent runtime via the internal trace endpoint.
	 */
	async recordTrace(input: RecordTraceInput): Promise<void> {
		await db.insert(agentExecutionTraces).values({
			agentId: input.agentId,
			skillName: input.skillName,
			success: input.success,
			toolCallCount: input.toolCallCount ?? 0,
			executionLog: input.executionLog ?? null,
		});
	}
}
