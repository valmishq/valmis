import type { ApiResponse } from './api.js';

// ─── Core Agent Types ─────────────────────────────────────────────────────────

/** Agent record returned by the API */
export interface Agent {
	id: string;
	ownerId: string;
	name: string;
	description?: string;
	systemInstruction?: string;
	/** Emoji character (default) or image URL for the agent's avatar */
	avatarUrl?: string;
	/** IDs of credentials this agent has access to */
	credentialIds: string[];
	/** LLM provider config ID used for chat/completion */
	modelConfigId?: string;
	/** LLM provider config ID used for generating memory embeddings */
	embeddingModelConfigId?: string;
	/**
	 * Dimension of the embedding vectors stored in agent_memory.
	 * Derived from the selected embedding model config.
	 */
	embeddingDim?: number;
	createdAt: Date;
	updatedAt: Date;
}

/** A single memory entry stored in the agent's vector memory */
export interface AgentMemoryEntry {
	id: string;
	agentId: string;
	content: string;
	metadata?: Record<string, unknown>;
	createdAt: Date;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** POST /v1/agents — create a new agent */
export interface CreateAgentRequestBody {
	ownerId: string;
	name: string;
	description?: string;
	systemInstruction?: string;
	avatarUrl?: string;
	credentialIds?: string[];
	modelConfigId?: string;
	embeddingModelConfigId?: string;
	embeddingDim?: number;
}

/** PUT /v1/agents/:id — update an existing agent */
export interface UpdateAgentRequestBody {
	ownerId: string;
	name?: string;
	description?: string;
	systemInstruction?: string;
	avatarUrl?: string;
	credentialIds?: string[];
	modelConfigId?: string;
	embeddingModelConfigId?: string;
	embeddingDim?: number;
}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export type AgentResponse = ApiResponse<Agent>;
export type AgentsListResponse = ApiResponse<Agent[]>;
export type AgentDeleteResponse = ApiResponse<{ deleted: boolean }>;
export type AgentMemoryListResponse = ApiResponse<AgentMemoryEntry[]>;
export type AgentMemoryDeleteResponse = ApiResponse<{ deleted: boolean }>;
