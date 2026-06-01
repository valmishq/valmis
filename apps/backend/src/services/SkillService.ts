import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { agentSkills, agentEvolvedSkills, agentExecutionTraces } from '../db/schema/index.js';
import { loadSkillCatalog, getSkillInstructions } from '@repo/utils';
import type { SkillCatalogEntry, AgentEvolvedSkill, AgentSkillAssignment } from '@repo/types';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface RecordTraceInput {
	agentId: string;
	skillName: string;
	success: boolean;
	toolCallCount?: number;
	executionLog?: Record<string, unknown>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Service for skill catalog access and agent skill management.
 *
 * Skill resolution priority (spec §5):
 *   1. agent_evolved_skills record for this agent+skill → use evolvedInstructions
 *   2. Fallback to codebase SKILL.md body via getSkillInstructions()
 */
export class SkillService {
	/** Returns the full static skill catalog from the codebase registry */
	getCatalog(): SkillCatalogEntry[] {
		return loadSkillCatalog();
	}

	/**
	 * Resolves the instructions to load for a given agent+skill.
	 * Checks agent_evolved_skills first, falls back to the codebase SKILL.md body.
	 * Returns null if the skill does not exist in the codebase.
	 */
	async getSkillInstructions(agentId: string, skillName: string): Promise<string | null> {
		// Check for an agent-specific evolved override first
		const evolved = await this.getEvolvedSkill(agentId, skillName);
		if (evolved) return evolved.evolvedInstructions;

		// Fall back to the codebase default
		return getSkillInstructions(skillName);
	}

	/** List skill names assigned to an agent */
	async getAgentSkills(agentId: string): Promise<string[]> {
		const rows = await db
			.select({ skillName: agentSkills.skillName })
			.from(agentSkills)
			.where(eq(agentSkills.agentId, agentId));
		return rows.map((r) => r.skillName);
	}

	/**
	 * Assigns a skill to an agent.
	 * Validates that the skill exists in the codebase catalog before inserting.
	 * No-op if already assigned (idempotent).
	 */
	async assignSkill(agentId: string, skillName: string): Promise<AgentSkillAssignment | null> {
		// Validate skill exists in catalog
		const catalog = loadSkillCatalog();
		const exists = catalog.some((s) => s.name === skillName);
		if (!exists) return null;

		await db.insert(agentSkills).values({ agentId, skillName }).onConflictDoNothing();

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
		const row = rows[0];
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

	/**
	 * Records a skill execution trace for the evolution engine.
	 * Called by the agent runtime after each skill execution — not exposed via API.
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
