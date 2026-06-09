import { z } from 'zod';

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/**
 * JSON Schema object — must be a plain object.
 * We accept any Record<string, unknown> here since the full JSON Schema spec
 * is not validated at this layer — only structural well-formedness is checked.
 * Runtime validation against the schema is done by the workflow runner.
 */
const jsonSchemaSchema = z.record(z.string(), z.unknown());

const workflowStepErrorHandlingSchema = z.object({
	action: z.enum(['stop', 'continue', 'retry']),
	/** Only used when action === 'retry'. Must be between 1 and 10 */
	maxRetries: z.number().int().min(1).max(10).optional(),
	/** Applied after retries are exhausted */
	fallbackAction: z.enum(['stop', 'continue']).optional(),
});

export const workflowStepSchema = z.object({
	id: z.uuid('Step id must be a valid UUID'),
	name: z.string().min(1, 'Step name is required').max(255),
	instruction: z.string().min(1, 'Step instruction is required'),
	inputMapping: z.string().optional(),
	/**
	 * Empty array = all tools allowed. Non-empty = strict subset.
	 */
	allowedTools: z.array(z.string()).default([]),
	/**
	 * Empty array = all agent credentials allowed. Non-empty = strict subset.
	 */
	allowedCredentialIds: z.array(z.uuid()).default([]),
	/**
	 * Maximum tool calls allowed per step tool loop. Default is 20.
	 * Each step runs like a chat turn — the agent can call tools repeatedly
	 * until it completes the step's instruction. This cap prevents runaway loops.
	 */
	maxToolCallsPerStep: z.number().int().min(1).max(100).optional(),
	/**
	 * Optional JSON Schema object. When present, the workflow runner enforces
	 * the LLM output must conform to this schema.
	 */
	expectedResponseSchema: jsonSchemaSchema.optional(),
	errorHandling: workflowStepErrorHandlingSchema,
});

export const workflowCreateSchema = z.object({
	name: z.string().min(1, 'Workflow name is required').max(255),
	description: z.string().optional(),
	steps: z
		.array(workflowStepSchema)
		.min(1, 'Workflow must have at least one step')
		.refine(
			(steps) => {
				// Ensure step IDs are unique within the workflow
				const ids = steps.map((s) => s.id);
				return new Set(ids).size === ids.length;
			},
			{ message: 'All step IDs must be unique within the workflow' },
		),
	isEnabled: z.boolean().optional().default(true),
});

export const workflowUpdateSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().optional(),
	steps: z
		.array(workflowStepSchema)
		.min(1, 'Workflow must have at least one step')
		.refine(
			(steps) => {
				const ids = steps.map((s) => s.id);
				return new Set(ids).size === ids.length;
			},
			{ message: 'All step IDs must be unique within the workflow' },
		)
		.optional(),
	isEnabled: z.boolean().optional(),
});

// ─── Exported validator functions ─────────────────────────────────────────────

/**
 * Validates a user-submitted workflow creation payload.
 * Returns the parsed, coerced result or throws a ZodError.
 *
 * @example
 * const validated = validateWorkflowCreate(req.body);
 */
export function validateWorkflowCreate(input: unknown) {
	return workflowCreateSchema.parse(input);
}

/**
 * Validates a user-submitted workflow update payload.
 * All fields are optional — only provided fields are validated.
 * Returns the parsed result or throws a ZodError.
 */
export function validateWorkflowUpdate(input: unknown) {
	return workflowUpdateSchema.parse(input);
}

export type ValidatedWorkflowCreate = z.infer<typeof workflowCreateSchema>;
export type ValidatedWorkflowUpdate = z.infer<typeof workflowUpdateSchema>;
