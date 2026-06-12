import { eq, and, inArray, sql } from 'drizzle-orm';
import { rmSync } from 'fs';
import { resolve } from 'path';
import { db } from '../db/index.js';
import { agents, agentCredentials, agentMemory } from '../db/schema/index.js';
import type { Agent, AgentMemoryEntry, MemoryType } from '@repo/types';
import { logger } from '../config/logger.js';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateAgentInput {
	ownerId: string;
	name: string;
	description?: string;
	systemInstruction?: string;
	avatarUrl?: string;
	credentialIds?: string[];
	modelConfigId?: string;
	embeddingModelConfigId?: string;
	embeddingDim?: number;
	allowInternetAccess?: boolean;
}

export interface UpdateAgentInput {
	name?: string;
	description?: string;
	systemInstruction?: string;
	avatarUrl?: string;
	credentialIds?: string[];
	modelConfigId?: string | null;
	embeddingModelConfigId?: string | null;
	embeddingDim?: number | null;
	allowInternetAccess?: boolean;
}

export interface AddMemoryInput {
	agentId: string;
	content: string;
	embedding: number[];
	memoryType: MemoryType;
	/** Optional thread scope — for 'working' memory entries */
	threadId?: string;
	metadata?: Record<string, unknown>;
}

export interface SearchMemoryInput {
	agentId: string;
	queryEmbedding: number[];
	/** Optional filter by memory type */
	memoryType?: MemoryType;
	/** Optional thread scope filter */
	threadId?: string;
	limit?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a DB row + credentialIds array to the Agent API type */
function rowToAgent(row: typeof agents.$inferSelect, credentialIds: string[]): Agent {
	return {
		id: row.id,
		ownerId: row.ownerId,
		name: row.name,
		description: row.description ?? undefined,
		systemInstruction: row.systemInstruction ?? undefined,
		avatarUrl: row.avatarUrl ?? undefined,
		credentialIds,
		modelConfigId: row.modelConfigId ?? undefined,
		embeddingModelConfigId: row.embeddingModelConfigId ?? undefined,
		embeddingDim: row.embeddingDim ?? undefined,
		allowInternetAccess: row.allowInternetAccess,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function rowToMemoryEntry(row: typeof agentMemory.$inferSelect): AgentMemoryEntry {
	return {
		id: row.id,
		agentId: row.agentId,
		threadId: row.threadId ?? undefined,
		memoryType: row.memoryType as MemoryType,
		content: row.content,
		metadata: (row.metadata as Record<string, unknown>) ?? undefined,
		createdAt: row.createdAt,
	};
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Service for agent CRUD operations and memory management.
 * Ownership is enforced at the DB layer — all queries include ownerId in WHERE.
 */
export class AgentService {
	/** Create a new agent and link credential access */
	async create(input: CreateAgentInput): Promise<Agent> {
		const now = new Date();

		const [row] = await db
			.insert(agents)
			.values({
				ownerId: input.ownerId,
				name: input.name,
				description: input.description ?? null,
				systemInstruction: input.systemInstruction ?? null,
				avatarUrl: input.avatarUrl ?? '🤖',
				modelConfigId: input.modelConfigId ?? null,
				embeddingModelConfigId: input.embeddingModelConfigId ?? null,
				embeddingDim: input.embeddingDim ?? null,
				allowInternetAccess: input.allowInternetAccess ?? true,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		// Insert credential junction rows
		if (input.credentialIds && input.credentialIds.length > 0) {
			await db.insert(agentCredentials).values(
				input.credentialIds.map((credentialId) => ({
					agentId: row.id,
					credentialId,
				})),
			);
		}

		return rowToAgent(row, input.credentialIds ?? []);
	}

	/** List all agents for an owner with their linked credential IDs */
	async listByOwner(ownerId: string): Promise<Agent[]> {
		const rows = await db
			.select()
			.from(agents)
			.where(eq(agents.ownerId, ownerId))
			.orderBy(agents.createdAt);

		if (rows.length === 0) return [];

		// Fetch all credential links for these agents in one query
		const agentIds = rows.map((r) => r.id);
		const credLinks = await db
			.select()
			.from(agentCredentials)
			.where(inArray(agentCredentials.agentId, agentIds));

		// Group credential IDs by agent
		const credMap = new Map<string, string[]>();
		for (const link of credLinks) {
			const existing = credMap.get(link.agentId) ?? [];
			existing.push(link.credentialId);
			credMap.set(link.agentId, existing);
		}

		return rows.map((row) => rowToAgent(row, credMap.get(row.id) ?? []));
	}

	/**
	 * Get a single agent by ID WITHOUT ownership check.
	 * Internal-only — used by background workers (e.g. the skill evolution
	 * engine) that have no request context. Never expose to HTTP handlers.
	 */
	async getByIdInternal(id: string): Promise<Agent | null> {
		const rows = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
		if (!rows[0]) return null;

		const credLinks = await db
			.select({ credentialId: agentCredentials.credentialId })
			.from(agentCredentials)
			.where(eq(agentCredentials.agentId, id));

		return rowToAgent(
			rows[0],
			credLinks.map((l) => l.credentialId),
		);
	}

	/** Get a single agent by ID with ownership check */
	async getById(id: string, ownerId: string): Promise<Agent | null> {
		const rows = await db
			.select()
			.from(agents)
			.where(and(eq(agents.id, id), eq(agents.ownerId, ownerId)))
			.limit(1);

		if (!rows[0]) return null;

		const row = rows[0];
		const credLinks = await db
			.select({ credentialId: agentCredentials.credentialId })
			.from(agentCredentials)
			.where(eq(agentCredentials.agentId, id));

		return rowToAgent(
			row,
			credLinks.map((l) => l.credentialId),
		);
	}

	/** Update an agent's configuration. Replaces credential links entirely. */
	async update(id: string, ownerId: string, input: UpdateAgentInput): Promise<Agent | null> {
		const existing = await this.getById(id, ownerId);
		if (!existing) return null;

		const updates: Partial<{
			name: string;
			description: string | null;
			systemInstruction: string | null;
			avatarUrl: string | null;
			modelConfigId: string | null;
			embeddingModelConfigId: string | null;
			embeddingDim: number | null;
			allowInternetAccess: boolean;
			updatedAt: Date;
		}> = { updatedAt: new Date() };

		if (input.name !== undefined) updates.name = input.name;
		if (input.description !== undefined) updates.description = input.description || null;
		if (input.systemInstruction !== undefined)
			updates.systemInstruction = input.systemInstruction || null;
		if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl || null;
		if (input.modelConfigId !== undefined) updates.modelConfigId = input.modelConfigId;
		if (input.embeddingModelConfigId !== undefined)
			updates.embeddingModelConfigId = input.embeddingModelConfigId;
		if (input.embeddingDim !== undefined) updates.embeddingDim = input.embeddingDim;
		if (input.allowInternetAccess !== undefined)
			updates.allowInternetAccess = input.allowInternetAccess;

		await db
			.update(agents)
			.set(updates)
			.where(and(eq(agents.id, id), eq(agents.ownerId, ownerId)));

		// Replace credential links if provided
		if (input.credentialIds !== undefined) {
			await db.delete(agentCredentials).where(eq(agentCredentials.agentId, id));
			if (input.credentialIds.length > 0) {
				await db.insert(agentCredentials).values(
					input.credentialIds.map((credentialId) => ({
						agentId: id,
						credentialId,
					})),
				);
			}
		}

		return this.getById(id, ownerId);
	}

	/** Delete an agent (cascades to credentials junction and memory) and removes the workspace */
	async delete(id: string, ownerId: string): Promise<boolean> {
		const result = await db
			.delete(agents)
			.where(and(eq(agents.id, id), eq(agents.ownerId, ownerId)));

		const deleted = (result.rowCount ?? 0) > 0;

		if (deleted) {
			// Clean up the per-agent persistent workspace directory.
			// Non-fatal — the workspace may not exist yet if the agent never ran.
			const workspacesBasePath =
				process.env.AGENT_WORKSPACES_PATH ?? resolve(process.cwd(), '.agent-workspaces');
			const workspacePath = `${workspacesBasePath}/${id}`;
			try {
				rmSync(workspacePath, { recursive: true, force: true });
			} catch (err) {
				logger.warn({ err, agentId: id }, '[agent] failed to remove workspace directory');
			}
		}

		return deleted;
	}

	// ─── Memory Operations ────────────────────────────────────────────────────

	/**
	 * Add a memory entry with its embedding vector.
	 * The embedding must already be computed by the caller (AgentMemoryService).
	 */
	async addMemory(input: AddMemoryInput): Promise<AgentMemoryEntry> {
		const [row] = await db
			.insert(agentMemory)
			.values({
				agentId: input.agentId,
				threadId: input.threadId ?? null,
				memoryType: input.memoryType,
				content: input.content,
				embedding: input.embedding,
				metadata: input.metadata ?? null,
			})
			.returning();

		return rowToMemoryEntry(row);
	}

	/** List memory entries for an agent (most recent first) */
	async listMemory(agentId: string, limit = 50, offset = 0): Promise<AgentMemoryEntry[]> {
		const rows = await db
			.select({
				id: agentMemory.id,
				agentId: agentMemory.agentId,
				threadId: agentMemory.threadId,
				memoryType: agentMemory.memoryType,
				content: agentMemory.content,
				metadata: agentMemory.metadata,
				createdAt: agentMemory.createdAt,
			})
			.from(agentMemory)
			.where(eq(agentMemory.agentId, agentId))
			.orderBy(sql`${agentMemory.createdAt} DESC`)
			.limit(limit)
			.offset(offset);

		return rows.map((row) => ({
			id: row.id,
			agentId: row.agentId,
			threadId: row.threadId ?? undefined,
			memoryType: row.memoryType as MemoryType,
			content: row.content,
			metadata: (row.metadata as Record<string, unknown>) ?? undefined,
			createdAt: row.createdAt,
		}));
	}

	/**
	 * Search memory by vector similarity (cosine distance).
	 * Returns the closest entries to the query embedding.
	 * Optional filters: memoryType, threadId.
	 */
	async searchMemory(input: SearchMemoryInput): Promise<AgentMemoryEntry[]> {
		const { agentId, queryEmbedding, memoryType, threadId, limit = 10 } = input;
		const vectorStr = `[${queryEmbedding.join(',')}]`;

		// Build WHERE conditions — agentId is always required, type and thread are optional
		const conditions = [eq(agentMemory.agentId, agentId)];
		if (memoryType) {
			conditions.push(eq(agentMemory.memoryType, memoryType));
		}
		if (threadId) {
			conditions.push(eq(agentMemory.threadId, threadId));
		}

		const rows = await db
			.select({
				id: agentMemory.id,
				agentId: agentMemory.agentId,
				threadId: agentMemory.threadId,
				memoryType: agentMemory.memoryType,
				content: agentMemory.content,
				metadata: agentMemory.metadata,
				createdAt: agentMemory.createdAt,
			})
			.from(agentMemory)
			.where(and(...conditions))
			.orderBy(sql`${agentMemory.embedding} <=> ${vectorStr}::vector`)
			.limit(limit);

		return rows.map((row) => ({
			id: row.id,
			agentId: row.agentId,
			threadId: row.threadId ?? undefined,
			memoryType: row.memoryType as MemoryType,
			content: row.content,
			metadata: (row.metadata as Record<string, unknown>) ?? undefined,
			createdAt: row.createdAt,
		}));
	}

	/** Delete a specific memory entry */
	async deleteMemory(memoryId: string, agentId: string): Promise<boolean> {
		const result = await db
			.delete(agentMemory)
			.where(and(eq(agentMemory.id, memoryId), eq(agentMemory.agentId, agentId)));
		return (result.rowCount ?? 0) > 0;
	}

	/**
	 * Delete multiple memory entries by ID in one query.
	 * The agentId guard ensures an agent can only delete its own memory.
	 * Returns the number of rows actually deleted (may be less than requested
	 * if some IDs did not exist or belonged to a different agent).
	 */
	async deleteMemoryBatch(memoryIds: string[], agentId: string): Promise<number> {
		if (memoryIds.length === 0) return 0;
		const result = await db
			.delete(agentMemory)
			.where(and(inArray(agentMemory.id, memoryIds), eq(agentMemory.agentId, agentId)));
		return result.rowCount ?? 0;
	}
}
