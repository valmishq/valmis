import {
	pgTable,
	pgEnum,
	uuid,
	varchar,
	text,
	integer,
	jsonb,
	timestamp,
	index,
} from 'drizzle-orm/pg-core';
import { workflowRuns } from './workflowRuns.js';

/** Execution status of a single workflow step attempt */
export const workflowStepLogStatusEnum = pgEnum('workflow_step_log_status', [
	'running',
	'success',
	'failed',
	'skipped',
]);

/**
 * Workflow step logs — one row per step per attempt within a workflow run.
 *
 * On retry, a new row is created with an incremented attemptNumber.
 * The final attempt row (whether success, failed, or skipped) reflects the
 * effective result of that step in the run.
 *
 * inputContext: the full context payload handed to the LLM for this step
 *   - includes resolved inputMapping, trigger payload, and previous step output
 *
 * outputData: the parsed LLM output for this step
 *   - JSON object when expectedResponseSchema was set and validated
 *   - { text: string } for free-text steps
 *   - null while still running
 */
export const workflowStepLogs = pgTable(
	'workflow_step_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		runId: uuid('run_id')
			.notNull()
			.references(() => workflowRuns.id, { onDelete: 'cascade' }),
		/** References WorkflowStep.id — the step UUID from the workflow definition */
		stepId: varchar('step_id', { length: 36 }).notNull(),
		/** 0-based index of the step in the workflow.steps array */
		stepIndex: integer('step_index').notNull(),
		/** Denormalized step name for display without joining the workflow table */
		stepName: varchar('step_name', { length: 255 }).notNull(),
		/** Current status of this step attempt */
		status: workflowStepLogStatusEnum('status').notNull().default('running'),
		/**
		 * The full input context provided to the LLM for this step.
		 * Stored for debugging and observability.
		 */
		inputContext: jsonb('input_context').notNull().default({}),
		/**
		 * The output produced by the LLM.
		 * JSON object when schema was provided and validated.
		 * { text: string } for free-text steps.
		 * Null while still running.
		 */
		outputData: jsonb('output_data'),
		/** Error message if this step attempt failed */
		error: text('error'),
		/** 1-based attempt number — increments on each retry of the same step */
		attemptNumber: integer('attempt_number').notNull().default(1),
		/** When this step attempt started */
		startedAt: timestamp('started_at').defaultNow().notNull(),
		/** When this step attempt finished — null while still running */
		completedAt: timestamp('completed_at'),
	},
	(table) => [
		index('workflow_step_logs_run_id_idx').on(table.runId),
		index('workflow_step_logs_step_id_idx').on(table.stepId),
	],
);
