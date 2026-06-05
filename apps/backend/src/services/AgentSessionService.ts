import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { agentThreads, agentMessages, agents } from '../db/schema/index.js';
import type {
	AgentThread,
	AgentMessage,
	AgentMessageRole,
	AgentThreadStatus,
	AgentTriggerType,
	ContentBlock,
	MessageTokenUsage,
} from '@repo/types';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateThreadInput {
	agentId: string;
	ownerId: string;
	title?: string;
	triggerType?: AgentTriggerType;
	triggerId?: string;
	triggerPayload?: Record<string, unknown>;
}

export interface AppendMessageInput {
	threadId: string;
	role: AgentMessageRole;
	content: ContentBlock[];
	toolCallId?: string;
	toolName?: string;
	tokenUsage?: MessageTokenUsage;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function rowToThread(row: typeof agentThreads.$inferSelect): AgentThread {
	return {
		id: row.id,
		agentId: row.agentId,
		ownerId: row.ownerId,
		title: row.title ?? undefined,
		status: row.status as AgentThreadStatus,
		triggerType: row.triggerType as AgentTriggerType,
		triggerId: row.triggerId ?? undefined,
		triggerPayload: (row.triggerPayload as Record<string, unknown>) ?? undefined,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function rowToMessage(row: typeof agentMessages.$inferSelect): AgentMessage {
	return {
		id: row.id,
		threadId: row.threadId,
		role: row.role as AgentMessageRole,
		content: row.content as ContentBlock[],
		toolCallId: row.toolCallId ?? undefined,
		toolName: row.toolName ?? undefined,
		tokenUsage: (row.tokenUsage as MessageTokenUsage) ?? undefined,
		createdAt: row.createdAt,
	};
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Service for agent thread and message persistence.
 * Ownership is enforced at the DB layer — all queries include ownerId in WHERE.
 */
export class AgentSessionService {
	// ─── Thread Operations ─────────────────────────────────────────────────

	/** Create a new thread for an agent */
	async createThread(input: CreateThreadInput): Promise<AgentThread> {
		const now = new Date();
		const [row] = await db
			.insert(agentThreads)
			.values({
				agentId: input.agentId,
				ownerId: input.ownerId,
				title: input.title ?? null,
				status: 'idle',
				triggerType: input.triggerType ?? 'chat',
				triggerId: input.triggerId ?? null,
				triggerPayload: input.triggerPayload ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		return rowToThread(row);
	}

	/** Get a single thread by ID with ownership check */
	async getThreadById(id: string, ownerId: string): Promise<AgentThread | null> {
		const rows = await db
			.select()
			.from(agentThreads)
			.where(and(eq(agentThreads.id, id), eq(agentThreads.ownerId, ownerId)))
			.limit(1);
		return rows[0] ? rowToThread(rows[0]) : null;
	}

	/**
	 * Get a thread by ID without ownership check.
	 * Used internally by the runtime (ownership already verified via PROXY_TOKEN).
	 */
	async getThreadByIdInternal(id: string): Promise<AgentThread | null> {
		const rows = await db.select().from(agentThreads).where(eq(agentThreads.id, id)).limit(1);
		return rows[0] ? rowToThread(rows[0]) : null;
	}

	/** List all threads for an agent, ordered newest first */
	async listThreads(agentId: string, ownerId: string): Promise<AgentThread[]> {
		// Verify agent ownership first
		const agentRows = await db
			.select({ id: agents.id })
			.from(agents)
			.where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId)))
			.limit(1);
		if (!agentRows[0]) return [];

		const rows = await db
			.select()
			.from(agentThreads)
			.where(and(eq(agentThreads.agentId, agentId), eq(agentThreads.ownerId, ownerId)))
			.orderBy(desc(agentThreads.createdAt));
		return rows.map(rowToThread);
	}

	/** Update thread status */
	async updateThreadStatus(id: string, status: AgentThreadStatus): Promise<void> {
		await db
			.update(agentThreads)
			.set({ status, updatedAt: new Date() })
			.where(eq(agentThreads.id, id));
	}

	/** Update thread title */
	async updateThreadTitle(id: string, ownerId: string, title: string): Promise<void> {
		await db
			.update(agentThreads)
			.set({ title, updatedAt: new Date() })
			.where(and(eq(agentThreads.id, id), eq(agentThreads.ownerId, ownerId)));
	}

	/** Delete a thread and all its messages (ownership enforced) */
	async deleteThread(id: string, ownerId: string): Promise<boolean> {
		const rows = await db
			.delete(agentThreads)
			.where(and(eq(agentThreads.id, id), eq(agentThreads.ownerId, ownerId)))
			.returning({ id: agentThreads.id });
		return rows.length > 0;
	}

	// ─── Message Operations ────────────────────────────────────────────────

	/** Append a message to a thread */
	async appendMessage(input: AppendMessageInput): Promise<AgentMessage> {
		const [row] = await db
			.insert(agentMessages)
			.values({
				threadId: input.threadId,
				role: input.role,
				content: input.content,
				toolCallId: input.toolCallId ?? null,
				toolName: input.toolName ?? null,
				tokenUsage: input.tokenUsage ?? null,
				createdAt: new Date(),
			})
			.returning();
		return rowToMessage(row);
	}

	/** List all messages for a thread, ordered by creation time (oldest first) */
	async listMessages(threadId: string, ownerId: string): Promise<AgentMessage[]> {
		// Verify thread ownership
		const thread = await this.getThreadById(threadId, ownerId);
		if (!thread) return [];

		const rows = await db
			.select()
			.from(agentMessages)
			.where(eq(agentMessages.threadId, threadId))
			.orderBy(agentMessages.createdAt);
		return rows.map(rowToMessage);
	}

	/**
	 * List messages without ownership check — used internally by the runtime.
	 * Ownership is verified at the PROXY_TOKEN level.
	 */
	async listMessagesInternal(threadId: string): Promise<AgentMessage[]> {
		const rows = await db
			.select()
			.from(agentMessages)
			.where(eq(agentMessages.threadId, threadId))
			.orderBy(agentMessages.createdAt);
		return rows.map(rowToMessage);
	}
}
