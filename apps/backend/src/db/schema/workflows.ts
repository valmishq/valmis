import {
	pgTable,
	uuid,
	varchar,
	text,
	boolean,
	jsonb,
	timestamp,
	index,
} from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import type { WorkflowStep } from '@repo/types';

/**
 * Agent workflows — defines multi-step automated pipelines for agents.
 *
 * Each workflow belongs to an agent and contains a linear sequence of steps
 * stored as JSONB. Steps are typed as WorkflowStep[] which includes:
 *   - instruction: task prompt for the LLM for this step
 *   - allowedTools: tool names the agent can call (empty = all)
 *   - allowedCredentialIds: credential IDs available (empty = all)
 *   - maxToolCallsPerStep: tool loop cap per step (like MAX_TOOL_CALLS_PER_TURN in chat)
 *   - expectedResponseSchema: optional JSON Schema for the step's output
 *   - errorHandling: stop | continue | retry
 *
 * Workflows are triggered by agent_triggers (cron/webhook/manual) via the
 * workflowId FK on the agent_triggers table.
 */
export const workflows = pgTable(
	'workflows',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/** Owner of the agent — denormalized for fast ownership checks */
		ownerId: uuid('owner_id').notNull(),
		/** User-visible label for this workflow */
		name: varchar('name', { length: 255 }).notNull(),
		/** Optional human description of what the workflow does */
		description: text('description'),
		/**
		 * Linear sequence of workflow steps stored as JSONB.
		 * Typed as WorkflowStep[] — validated by workflow validator before storage.
		 * Each step is a self-contained task with its own tools, credentials, and
		 * output schema. The runner executes steps in array order.
		 */
		steps: jsonb('steps').$type<WorkflowStep[]>().notNull().default([]),
		/** Whether this workflow is currently active and can be executed */
		isEnabled: boolean('is_enabled').notNull().default(true),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		index('workflows_agent_id_idx').on(table.agentId),
		index('workflows_owner_id_idx').on(table.ownerId),
	],
);
