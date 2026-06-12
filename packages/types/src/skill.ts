import type { ApiResponse } from './api.js';

// ─── Core Skill Types ─────────────────────────────────────────────────────────

/**
 * Where a skill comes from:
 *   - 'builtin'   — shipped in the codebase under packages/utils/src/skills/
 *   - 'installed' — installed by a user from a GitHub repository (skills table)
 */
export type SkillSource = 'builtin' | 'installed';

/**
 * A single entry in the merged skill catalog (built-ins + the owner's
 * installed skills). Built-ins are parsed from the YAML frontmatter of each
 * skill's SKILL.md file; installed entries come from the skills table.
 */
export interface SkillCatalogEntry {
	/** Unique skill identifier — matches the directory name (builtin) or frontmatter name (installed) */
	name: string;
	/** What the skill does and when to use it */
	description: string;
	/** Whether this skill is eligible for evolution by the evolution engine */
	evolvable: boolean;
	/** Origin of the skill */
	source: SkillSource;
	/** Present for installed skills only — the skills table row id */
	skillId?: string;
	/** Present for installed skills only — "owner/repo" the skill was installed from */
	sourceRepo?: string;
}

/**
 * Compact skill entry delivered to the agent runtime for the system-prompt
 * skill index (progressive disclosure). Full instructions are materialized
 * into the agent workspace before spawn — never passed through env.
 */
export interface SkillRuntimeEntry {
	name: string;
	description: string;
	/** Workspace-relative path of the skill's SKILL.md, e.g. "skills/code-reviewer/SKILL.md" */
	path: string;
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

// ─── Installed Skills (GitHub install) ───────────────────────────────────────

/**
 * A user-installed skill from a GitHub repository.
 * Stored in the skills table; file contents live in skill_files.
 */
export interface InstalledSkill {
	id: string;
	ownerId: string;
	name: string;
	description: string;
	evolvable: boolean;
	/** Full parsed YAML frontmatter of the SKILL.md */
	frontmatter: Record<string, unknown>;
	/** The URL the user pasted at install time */
	sourceUrl: string;
	/** "owner/repo" */
	sourceRepo: string;
	/** Branch/tag the user specified (null = repo default branch) */
	sourceRef?: string;
	/** Subdirectory within the repo containing the skill */
	sourceSubpath?: string;
	/** Resolved full 40-char commit SHA — the provenance pin */
	commitSha: string;
	/** SHA-256 over the canonical bundle — verified before every materialization */
	contentHash: string;
	createdAt: Date;
	updatedAt: Date;
}

/** A single finding from the install-time security scan */
export interface SkillScanFinding {
	/** 'block' findings prevent install; 'warn' findings are surfaced for human review */
	severity: 'block' | 'warn';
	/** Machine-readable rule id, e.g. 'prompt-injection-marker', 'external-url' */
	rule: string;
	/** Bundle-relative file path the finding was detected in */
	file: string;
	/** 1-based line number when known */
	line?: number;
	/** Short excerpt of the matched content (capped) */
	excerpt: string;
}

/** POST /v1/skills/install/preview */
export interface SkillInstallPreviewRequestBody {
	repoUrl: string;
	subpath?: string;
	ref?: string;
}

/**
 * The full install preview shown to the user before confirmation.
 * The server caches the fetched bundle under previewId so the confirmed
 * install is byte-identical to what the user reviewed.
 */
export interface SkillInstallPreview {
	previewId: string;
	name: string;
	description: string;
	evolvable: boolean;
	frontmatter: Record<string, unknown>;
	/** Full SKILL.md content (frontmatter + body) for human review */
	skillMdContent: string;
	/** Bundle file tree (files that WILL be installed) */
	files: Array<{ path: string; size: number }>;
	totalSize: number;
	/**
	 * Files excluded from the bundle because their extension is not in the
	 * allowed file-type list (SKILL_INSTALL_ALLOWED_FILE_EXT, default "md,txt").
	 * Surfaced to the user at review so the filtering is never silent.
	 */
	filteredFiles: string[];
	/**
	 * The active allowed file extensions (without leading dot), e.g. ["md","txt"].
	 * Shown in the review UI so the user understands the filtering policy.
	 */
	allowedExtensions: string[];
	sourceRepo: string;
	sourceRef?: string;
	sourceSubpath?: string;
	commitSha: string;
	contentHash: string;
	findings: SkillScanFinding[];
}

/** POST /v1/skills/install/confirm */
export interface SkillInstallConfirmRequestBody {
	previewId: string;
}

/** A skill bundle file with content — GET /v1/skills/installed/:id/files */
export interface InstalledSkillFile {
	path: string;
	size: number;
	content: string;
}

// ─── Execution Traces (evolution engine) ─────────────────────────────────────

/**
 * POST /v1/runtime/internal/skills/trace — recorded by the agent runtime
 * (PROXY_TOKEN auth; agentId is taken from the token, never the body).
 */
export interface SkillTraceRequestBody {
	skillName: string;
	success: boolean;
	toolCallCount: number;
	/** Condensed execution log, e.g. { toolCalls: [{ name, ok }], error? } */
	executionLog?: Record<string, unknown>;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/**
 * POST /v1/agents/:id/skills — assign a skill to an agent.
 * Ownership is derived from the authenticated token, never from the body.
 */
export interface AssignSkillRequestBody {
	skillName: string;
}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export type SkillCatalogResponse = ApiResponse<SkillCatalogEntry[]>;
export type AgentSkillsListResponse = ApiResponse<string[]>;
export type AgentEvolvedSkillResponse = ApiResponse<AgentEvolvedSkill>;
export type AgentEvolvedSkillsListResponse = ApiResponse<AgentEvolvedSkill[]>;
export type AgentSkillAssignResponse = ApiResponse<AgentSkillAssignment>;
export type AgentSkillRemoveResponse = ApiResponse<{ removed: boolean }>;
export type SkillInstallPreviewResponse = ApiResponse<SkillInstallPreview>;
export type InstalledSkillResponse = ApiResponse<InstalledSkill>;
export type InstalledSkillsListResponse = ApiResponse<InstalledSkill[]>;
export type InstalledSkillDeleteResponse = ApiResponse<{
	deleted: boolean;
	unassignedAgentCount: number;
}>;
export type InstalledSkillFilesResponse = ApiResponse<InstalledSkillFile[]>;
export type SkillTraceResponse = ApiResponse<{ recorded: boolean }>;
