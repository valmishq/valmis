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
import type { WorkflowStep, WorkflowNode, WorkflowEdge } from '@repo/types';

/**
 * Agent workflows — defines multi-step automated pipelines for agents.
 *
 * The authoritative definition is a node/edge GRAPH (`nodes` + `edges`):
 *   - nodes: trigger (entry) + agent (step) + condition (branch) + loop
 *   - edges: directed connections; multi-output nodes use named source handles
 * The legacy `steps` column is kept as a derived linear projection of the graph
 * (written on every save) so older read paths keep working.
 *
 * Each agent node's `data` is a WorkflowStep which includes:
 *   - instruction: task prompt for the LLM for this step
 *   - allowedTools: tool names the agent can call (empty = all)
 *   - allowedCredentialIds: credential IDs available (empty = all)
 *   - maxToolCallsPerStep: tool loop cap per step (like MAX_TOOL_CALLS_PER_TURN in chat)
 *   - expectedResponseSchema: optional JSON Schema for the step's output
 *   - errorHandling: stop | continue | retry
 *
 * Workflows are triggered by agent_triggers (cron/webhook/manual/app) via the
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
		 * Legacy linear projection of the graph, derived from `nodes`/`edges` on
		 * every save. Kept for backward-compatible reads (run-detail timeline,
		 * step-log ordering, list step counts). NOT the source of truth.
		 */
		steps: jsonb('steps').$type<WorkflowStep[]>().notNull().default([]),
		/**
		 * Authoritative graph nodes (trigger + agent + condition + loop), stored as
		 * JSONB. Validated by the workflow validator before storage.
		 */
		nodes: jsonb('nodes').$type<WorkflowNode[]>().notNull().default([]),
		/** Authoritative graph edges (directed connections), stored as JSONB. */
		edges: jsonb('edges').$type<WorkflowEdge[]>().notNull().default([]),
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
