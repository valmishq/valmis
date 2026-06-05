import { pgTable, pgEnum, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/** Lifecycle status of an agent thread */
export const agentThreadStatusEnum = pgEnum('agent_thread_status', [
	'idle',
	'running',
	'completed',
	'error',
]);

/**
 * How this thread was initiated.
 * 'chat' = interactive user conversation
 * 'cron' = scheduled cron trigger
 * 'webhook' = external webhook trigger
 * 'manual' = user clicked "run now"
 */
export const agentTriggerTypeEnum = pgEnum('agent_trigger_type', [
	'chat',
	'cron',
	'webhook',
	'manual',
]);

/**
 * Agent threads — each thread is a single execution context for an agent.
 *
 * Threads are created in two ways:
 *   1. Interactive chat: user sends a message → thread is created for that conversation
 *   2. Trigger execution: a cron/webhook/manual trigger fires → thread created for that run
 *
 * Every thread maps to one Docker container spawn. The container exits when the
 * agent finishes its turn; the thread persists in the DB with the full message history.
 */
export const agentThreads = pgTable(
	'agent_threads',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/** Owner of the agent — denormalized for fast ownership checks without joining agents */
		ownerId: uuid('owner_id').notNull(),
		/** Optional user-visible title for the thread */
		title: text('title'),
		/** Thread lifecycle status */
		status: agentThreadStatusEnum('status').notNull().default('idle'),
		/** How this thread was created */
		triggerType: agentTriggerTypeEnum('trigger_type').notNull().default('chat'),
		/** ID of the agent_trigger that created this thread — null for chat threads */
		triggerId: uuid('trigger_id'),
		/** Payload delivered to the agent when this thread was spawned by a trigger */
		triggerPayload: jsonb('trigger_payload'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		index('agent_threads_agent_id_idx').on(table.agentId),
		index('agent_threads_owner_id_idx').on(table.ownerId),
		index('agent_threads_trigger_id_idx').on(table.triggerId),
	],
);
