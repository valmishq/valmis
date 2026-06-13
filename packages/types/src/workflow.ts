import type { ApiResponse } from './api.js';
import type { AgentTrigger, AgentTriggerKind, AgentTriggerConfig } from './agentRuntime.js';

// ─── JSON Schema ──────────────────────────────────────────────────────────────

/**
 * A simplified JSON Schema object.
 * The user defines this in the workflow builder to describe what JSON shape
 * a step's LLM output must conform to.
 * Validated by the workflow validator before storage.
 */
export type JsonSchema = Record<string, unknown>;

// ─── Step Definition ──────────────────────────────────────────────────────────

export interface WorkflowStepErrorHandling {
	/**
	 * Action to take if the step fails (tool error, output parse failure, etc.)
	 * 'stop': Halt the entire workflow run and mark it as failed.
	 * 'continue': Ignore the error and proceed to the next step.
	 * 'retry': Re-attempt the step up to `maxRetries` times, then apply `fallbackAction`.
	 */
	action: 'stop' | 'continue' | 'retry';
	/** Only relevant when action === 'retry'. Default: 1 */
	maxRetries?: number;
	/** Applied after retries exhausted. Default: 'stop' */
	fallbackAction?: 'stop' | 'continue';
}

export interface WorkflowStep {
	/** Unique UUID for this step within the workflow */
	id: string;
	/** Human-readable label, e.g. "Fetch Weather Data" */
	name: string;

	/**
	 * The task instruction injected into the agent's prompt for this step.
	 * Combined with the agent's base system instruction at runtime.
	 */
	instruction: string;

	/**
	 * Optional template string for data from prior steps or the trigger payload.
	 * Interpolated before the instruction is sent to the LLM.
	 * Variables: {{trigger.payload}}, {{steps.<stepIndex>.output}}
	 * If omitted, the runner automatically appends the previous step's output.
	 */
	inputMapping?: string;

	/**
	 * Tool names the agent is allowed to call during this step.
	 * Empty array = all tools available to the agent are allowed.
	 * Specified names = strict subset of available tools for this step only.
	 */
	allowedTools: string[];

	/**
	 * Credential IDs the agent is allowed to use during this step (via call_api).
	 * Empty array = all credentials linked to the agent are allowed.
	 * Specified IDs = strict subset of the agent's linked credentials for this step.
	 * IDs not in the agent's credential list are silently ignored.
	 */
	allowedCredentialIds: string[];

	/**
	 * Maximum number of tool calls the agent is allowed to make within this step's
	 * tool loop. This mirrors MAX_TOOL_CALLS_PER_TURN from the chat runner.
	 * Each step runs its own full agent loop (prompt → tool calls → final reply),
	 * and this cap prevents runaway loops within a single step.
	 * Default: 20 (same as the global chat default).
	 */
	maxToolCallsPerStep?: number;

	/**
	 * Optional JSON Schema describing the required output format.
	 * When present:
	 *   - The runner appends a JSON-mode instruction to the prompt.
	 *   - The LLM must respond with a JSON object matching this schema.
	 *   - The runner validates the response; on failure, errorHandling applies.
	 * When absent, the step runs in free-text mode.
	 */
	expectedResponseSchema?: JsonSchema;

	errorHandling: WorkflowStepErrorHandling;
}

// ─── Trigger Input (for create/update requests) ───────────────────────────────

/**
 * Trigger configuration provided when creating or updating a workflow.
 * On create, a trigger is always provisioned (defaults to manual kind).
 * On update, if provided, the existing trigger's config is updated.
 */
export interface WorkflowTriggerInput {
	/** Trigger kind. Defaults to 'manual' if not specified. */
	kind?: AgentTriggerKind;
	/**
	 * Human-readable name for the trigger.
	 * Defaults to the workflow name if not specified.
	 */
	name?: string;
	/**
	 * Type-specific configuration.
	 * cron:    { schedule: string, timezone?: string }
	 * webhook: { requireSignature?: boolean } (secret is generated server-side and
	 *          preserved across updates — clients never send it)
	 * manual:  {} (empty)
	 */
	config?: AgentTriggerConfig;
	/** Optional description for this trigger. */
	description?: string;
}

// ─── Workflow Definition ──────────────────────────────────────────────────────

export interface Workflow {
	id: string;
	agentId: string;
	ownerId: string;
	name: string;
	description?: string;
	/** Linear sequence: steps[0] → steps[1] → … */
	steps: WorkflowStep[];
	isEnabled: boolean;
	/**
	 * The trigger associated with this workflow.
	 * Always present on responses — every workflow has exactly one trigger provisioned at creation.
	 */
	trigger?: AgentTrigger;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Execution & Logging ──────────────────────────────────────────────────────

export type WorkflowRunStatus = 'running' | 'completed' | 'error';
export type WorkflowStepLogStatus = 'running' | 'success' | 'failed' | 'skipped';

/** Represents a single execution of a workflow */
export interface WorkflowRun {
	id: string;
	workflowId: string;
	agentId: string;
	ownerId: string;
	status: WorkflowRunStatus;
	triggerType: 'cron' | 'webhook' | 'manual';
	triggerId?: string;
	triggerPayload?: Record<string, unknown>;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
}

/** Represents the log of a single step within a workflow run */
export interface WorkflowStepLog {
	id: string;
	runId: string;
	stepId: string;
	stepIndex: number;
	stepName: string;
	status: WorkflowStepLogStatus;
	/** The specific input context provided to the LLM for this step */
	inputContext: Record<string, unknown>;
	/** The parsed output produced by the LLM (JSON in schema mode, or { text: string }) */
	outputData?: Record<string, unknown>;
	error?: string;
	/** 1-based attempt number; increments on retry */
	attemptNumber: number;
	startedAt: Date;
	completedAt?: Date;
}

// ─── Trigger Context ─────────────────────────────────────────────────────────

/**
 * Normalized trigger context injected into the workflow runner.
 *
 * Built from the raw triggerPayload + triggerType before execution starts.
 * Available to all steps via {{trigger.*}} in inputMapping templates and
 * injected into the system prompt of Step 1.
 *
 * The runner serializes this into the step log's inputContext so the full
 * trigger context is preserved for debugging.
 */
export interface WorkflowTriggerContext {
	/** The trigger type that initiated this run */
	type: 'cron' | 'webhook' | 'manual';
	/**
	 * The user-defined trigger name — set when the trigger was created.
	 * e.g. "Slack Incoming Webhook", "Daily Report", "Manual Run"
	 * Copied from AgentTrigger.name at fire time. Always explicitly defined by the user.
	 */
	triggerName: string;
	/**
	 * ISO 8601 timestamp of when the trigger fired.
	 * For cron: the scheduled fire time. For webhook: the request receipt time.
	 */
	firedAt: string;
	/**
	 * The raw payload from the trigger source.
	 * For webhook: the parsed JSON request body (may contain source-specific fields
	 * such as Slack event objects, GitHub webhook payloads, etc.)
	 * For cron: { firedAt: string }.
	 * For manual: { firedAt: string }.
	 */
	payload: Record<string, unknown>;
}

// ─── Workflow Summary (for agent tool use) ────────────────────────────────────

/**
 * Lightweight summary of a workflow returned by the list_workflows agent tool.
 * Does not include steps — the agent can call read_workflow to get the full definition.
 */
export interface WorkflowSummary {
	id: string;
	name: string;
	description?: string;
	/** Number of steps in this workflow */
	stepCount: number;
	isEnabled: boolean;
}

// ─── API Request/Response Bodies ──────────────────────────────────────────────

export interface CreateWorkflowRequestBody {
	name: string;
	description?: string;
	steps: WorkflowStep[];
	isEnabled?: boolean;
	/**
	 * Trigger to provision alongside the workflow.
	 * Defaults to a manual trigger named after the workflow if omitted.
	 */
	trigger?: WorkflowTriggerInput;
}

export interface UpdateWorkflowRequestBody {
	name?: string;
	description?: string;
	steps?: WorkflowStep[];
	isEnabled?: boolean;
	/**
	 * Trigger configuration to update.
	 * When provided, the existing trigger's kind/config/name/description is updated.
	 */
	trigger?: WorkflowTriggerInput;
}

// ─── Webhook Endpoint Response ────────────────────────────────────────────────

/**
 * Data returned to external webhook callers on a successful (202 Accepted) delivery.
 * runId/workflowId are null when the trigger has no workflow attached
 * (legacy standalone triggers that spawn a plain chat thread).
 */
export interface WebhookAccepted {
	received: true;
	runId: string | null;
	workflowId: string | null;
}

export type WebhookAcceptedResponse = ApiResponse<WebhookAccepted>;

// ─── API Response Envelopes ───────────────────────────────────────────────────

export type WorkflowResponse = ApiResponse<Workflow>;
export type WorkflowsListResponse = ApiResponse<Workflow[]>;
export type WorkflowDeleteResponse = ApiResponse<{ deleted: boolean }>;
export type WorkflowRunResponse = ApiResponse<WorkflowRun>;
export type WorkflowRunsListResponse = ApiResponse<{ runs: WorkflowRun[]; total: number }>;
export type WorkflowStepLogsListResponse = ApiResponse<WorkflowStepLog[]>;
