import type { ApiResponse } from './api.js';

// ─── Memory Type ──────────────────────────────────────────────────────────────

/**
 * Four-layer memory classification based on cognitive memory research.
 *
 * - episodic:   Raw records of events (conversation logs, task outcomes)
 * - semantic:   Distilled facts and long-term domain knowledge
 * - procedural: Behavioral rules, patterns, and operating constraints
 * - working:    Short-lived context scoped to the current thread
 */
export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'working';

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
	/** Optional thread scope — populated for 'working' memory entries */
	threadId?: string;
	/** Memory classification */
	memoryType: MemoryType;
	content: string;
	metadata?: Record<string, unknown>;
	createdAt: Date;
}

/** A memory search result — memory entry with similarity score */
export interface AgentMemorySearchResult {
	id: string;
	agentId: string;
	threadId?: string;
	memoryType: MemoryType;
	content: string;
	metadata?: Record<string, unknown>;
	createdAt: Date;
	/** Cosine similarity score — higher is more similar (0–1 range) */
	similarity: number;
}

// ─── Memory Proxy Protocol (sandbox → host) ───────────────────────────────────

/**
 * Memory write request — sent from the agent sandbox to the host.
 * The host resolves the embedding model, generates the vector, and persists the entry.
 */
export interface MemoryWriteRequest {
	content: string;
	memoryType: MemoryType;
	/** Optional thread scope — typically the current threadId for 'working' memory */
	threadId?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Memory search request — sent from the agent sandbox to the host.
 * The host embeds the query and returns the closest memory entries.
 */
export interface MemorySearchRequest {
	query: string;
	/** Optional filter by memory type — if omitted, searches all types */
	memoryType?: MemoryType;
	/** Optional thread scope filter */
	threadId?: string;
	/** Number of results to return (default 5, max 20) */
	topK?: number;
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
export type AgentMemoryWriteResponse = ApiResponse<AgentMemoryEntry>;
export type AgentMemorySearchResponse = ApiResponse<AgentMemorySearchResult[]>;
