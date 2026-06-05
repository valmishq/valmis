import { pgTable, pgEnum, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { agentThreads } from './agentThreads.js';

/**
 * Message role — mirrors pi-ai message conventions so rows can be deserialized
 * directly back into a pi-ai Context.messages array.
 */
export const agentMessageRoleEnum = pgEnum('agent_message_role', [
	'user',
	'assistant',
	'tool_result',
]);

/**
 * Agent messages — stores the full conversation history for each thread.
 *
 * The `content` column holds a pi-ai ContentBlock[] array (JSON-serializable),
 * enabling the agent-runtime to reconstruct a pi-ai Context from these rows
 * and resume conversation state across container runs.
 *
 * Schema aligns with pi-ai message format:
 *   user        → { role: 'user', content: ContentBlock[], timestamp }
 *   assistant   → { role: 'assistant', content: ContentBlock[], usage, stopReason, timestamp }
 *   tool_result → { role: 'toolResult', toolCallId, toolName, content, isError, timestamp }
 */
export const agentMessages = pgTable(
	'agent_messages',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		threadId: uuid('thread_id')
			.notNull()
			.references(() => agentThreads.id, { onDelete: 'cascade' }),
		/** Message role */
		role: agentMessageRoleEnum('role').notNull(),
		/**
		 * Serialized pi-ai ContentBlock[].
		 * user:        [{ type: 'text', text: '...' }] or with image blocks
		 * assistant:   text / toolCall / thinking blocks
		 * tool_result: [{ type: 'text', text: '...' }]
		 */
		content: jsonb('content').notNull(),
		/**
		 * For tool_result messages: the toolCallId this result corresponds to.
		 * Matches the `id` field in the assistant message's toolCall block.
		 */
		toolCallId: varchar('tool_call_id', { length: 255 }),
		/** For tool_result messages: the name of the tool that was called */
		toolName: varchar('tool_name', { length: 255 }),
		/**
		 * Token usage and cost for assistant messages (null for other roles).
		 * Written once at message completion.
		 * Shape: { input: number, output: number, cost: { total: number } }
		 */
		tokenUsage: jsonb('token_usage'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		index('agent_messages_thread_id_idx').on(table.threadId),
		/** Compound index — messages always fetched ordered by thread + creation time */
		index('agent_messages_thread_created_idx').on(table.threadId, table.createdAt),
	],
);
