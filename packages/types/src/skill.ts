import type { ApiResponse } from './api.js';

// ─── Core Skill Types ─────────────────────────────────────────────────────────

/**
 * A single entry in the static skill catalog loaded from the codebase.
 * Parsed from the YAML frontmatter of each skill's SKILL.md file.
 */
export interface SkillCatalogEntry {
	/** Unique skill identifier — matches the directory name */
	name: string;
	/** What the skill does and when to use it */
	description: string;
	/** Whether this skill is eligible for evolution by the evolution engine */
	evolvable: boolean;
}

/**
 * A skill that has been assigned to a specific agent.
 * Stored in the agent_skills junction table.
 */
export interface AgentSkillAssignment {
	agentId: string;
	/** Matches the directory name in packages/utils/src/skills/ */
	skillName: string;
}

/**
 * An agent-specific evolved override of a skill's instructions.
 * Stored in the agent_evolved_skills table.
 */
export interface AgentEvolvedSkill {
	id: string;
	agentId: string;
	skillName: string;
	/** The optimized markdown instructions produced by the evolution engine */
	evolvedInstructions: string;
	/** Increments on each evolution cycle */
	version: number;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** POST /v1/agents/:id/skills — assign a skill to an agent */
export interface AssignSkillRequestBody {
	ownerId: string;
	skillName: string;
}

/** DELETE /v1/agents/:id/skills/:skillName — body for ownership check */
export interface RemoveSkillRequestBody {
	ownerId: string;
}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export type SkillCatalogResponse = ApiResponse<SkillCatalogEntry[]>;
export type AgentSkillsListResponse = ApiResponse<string[]>;
export type AgentEvolvedSkillResponse = ApiResponse<AgentEvolvedSkill>;
export type AgentSkillAssignResponse = ApiResponse<AgentSkillAssignment>;
export type AgentSkillRemoveResponse = ApiResponse<{ removed: boolean }>;
