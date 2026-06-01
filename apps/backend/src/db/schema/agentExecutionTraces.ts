import {
	pgTable,
	uuid,
	varchar,
	boolean,
	integer,
	jsonb,
	timestamp,
	index,
} from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/**
 * Stores execution telemetry for agent skill runs.
 * Used by the evolution engine to identify skills that need improvement.
 * Written by the agent runtime — no API write endpoint is exposed.
 */
export const agentExecutionTraces = pgTable(
	'agent_execution_traces',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/** Matches the directory name in packages/utils/src/skills/ */
		skillName: varchar('skill_name', { length: 255 }).notNull(),
		/** Whether the skill execution completed successfully */
		success: boolean('success').notNull(),
		/** Number of tool calls made during execution */
		toolCallCount: integer('tool_call_count').notNull().default(0),
		/** Structured execution log for analysis by the evolution engine */
		executionLog: jsonb('execution_log'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		index('agent_execution_traces_agent_id_idx').on(table.agentId),
		index('agent_execution_traces_skill_name_idx').on(table.skillName),
	],
);
