import type { ApiResponse } from './api.js';
import type { SkillRuntimeEntry } from './skill.js';
import type { Workflow, WorkflowTriggerContext } from './workflow.js';

// ─── Enum mirrors (TypeScript unions matching the pgEnum values) ──────────────

export type AgentThreadStatus = 'idle' | 'running' | 'completed' | 'error';
export type AgentTriggerType = 'chat' | 'cron' | 'webhook' | 'manual';
/** Valid trigger kinds — 'chat' is not a trigger, only a thread origin */
export type AgentTriggerKind = 'cron' | 'webhook' | 'manual';
export type AgentMessageRole = 'user' | 'assistant' | 'tool_result';

// ─── Thread ───────────────────────────────────────────────────────────────────

/** An agent thread — one execution context (one Docker container spawn) */
export interface AgentThread {
	id: string;
	agentId: string;
	ownerId: string;
	title?: string;
	status: AgentThreadStatus;
	triggerType: AgentTriggerType;
	triggerId?: string;
	triggerPayload?: Record<string, unknown>;
	/**
	 * Current context window occupancy in tokens.
	 * Set to usage.input from the most recent assistant message after each LLM turn.
	 * Unlike total input token sums, this value represents what will actually be sent
	 * to the LLM on the next call. A context compaction feature can reduce this value
	 * without affecting the cumulative total-token / cost metrics.
	 * Null for threads created before this field was introduced.
	 */
	contextTokens?: number;
	/**
	 * True when this thread was created automatically by a workflow execution
	 * (cron / webhook / manual trigger with a workflowId).
	 * False for interactive user chat threads.
	 */
	isWorkflowThread: boolean;
	/**
	 * True when the user has pinned this thread to the top of the sidebar.
	 * Pinned threads sort before unpinned ones; within each group ordering is by updatedAt DESC.
	 */
	isPinned: boolean;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Message ──────────────────────────────────────────────────────────────────

/**
 * Token usage recorded on assistant messages.
 * Mirrors the usage shape returned by pi-ai's AssistantMessage.
 */
export interface MessageTokenUsage {
	input: number;
	output: number;
	cost: {
		total: number;
	};
}

/** A single message in an agent thread */
export interface AgentMessage {
	id: string;
	threadId: string;
	role: AgentMessageRole;
	/**
	 * pi-ai ContentBlock[] — serialized as JSON.
	 * Each block has a `type` field: 'text' | 'toolCall' | 'thinking' | 'image'
	 */
	content: ContentBlock[];
	/** For tool_result: the toolCallId this result corresponds to */
	toolCallId?: string;
	/** For tool_result: the tool name */
	toolName?: string;
	/** For assistant: token usage and cost (null for other roles) */
	tokenUsage?: MessageTokenUsage;
	createdAt: Date;
}

/**
 * Minimal ContentBlock type — mirrors pi-ai's ContentBlock union.
 * We define it here so frontend/backend can type-check message content
 * without importing pi-ai directly.
 */
export type ContentBlock =
	| { type: 'text'; text: string }
	| { type: 'thinking'; thinking: string }
	| {
			type: 'toolCall';
			id: string;
			name: string;
			arguments: Record<string, unknown>;
	  }
	| { type: 'image'; data: string; mimeType: string };

// ─── Trigger ──────────────────────────────────────────────────────────────────

/** Cron trigger config */
export interface CronTriggerConfig {
	schedule: string; // cron expression, e.g. "0 9 * * 1-5"
	timezone?: string; // IANA timezone, e.g. "America/New_York"
}

/** Webhook trigger config */
export interface WebhookTriggerConfig {
	/** HMAC-SHA256 secret for verifying X-Hub-Signature-256 header */
	secret: string;
	/**
	 * Whether incoming requests must carry a valid X-Hub-Signature-256 HMAC signature.
	 * Absent means true — existing triggers created before this flag keep requiring signatures.
	 * When false, anyone with the webhook URL can fire the trigger.
	 */
	requireSignature?: boolean;
}

/** Manual trigger config (no fields needed) */
export type ManualTriggerConfig = Record<string, never>;

export type AgentTriggerConfig = CronTriggerConfig | WebhookTriggerConfig | ManualTriggerConfig;

/** An agent trigger subscription */
export interface AgentTrigger {
	id: string;
	agentId: string;
	ownerId: string;
	kind: AgentTriggerKind;
	name: string;
	config: AgentTriggerConfig;
	isEnabled: boolean;
	lastFiredAt?: Date;
	description?: string;
	/**
	 * Optional ID of the workflow this trigger executes when fired.
	 * When set: trigger creates a workflow_run and executes the pipeline.
	 * When null/undefined: trigger has no workflow attached.
	 */
	workflowId?: string;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Proxy Protocol ───────────────────────────────────────────────────────────

/**
 * Credential proxy request — sent from the agent sandbox to the host.
 * The host resolves the credential and executes the HTTP call on behalf of
 * the sandbox, so raw credential values never enter the container.
 *
 * When `credentialId` is empty or omitted, the host executes the request
 * directly without injecting any authentication. Use this for public APIs.
 */
export interface ProxyRequest {
	/**
	 * ID of the credential to use. Must be in the agent's allowed credential list.
	 * Pass an empty string or omit entirely for public APIs that need no auth.
	 */
	credentialId: string;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	url: string;
	/** Additional caller-supplied headers merged with credential-resolved headers */
	headers?: Record<string, string>;
	/** Additional caller-supplied query params merged with credential-resolved params */
	qs?: Record<string, string>;
	/** Request body (raw string — stringify JSON or form data before passing) */
	body?: string;
}

/** Response returned from the credential proxy to the sandbox */
export interface ProxyResponse {
	status: number;
	headers: Record<string, string>;
	/** Raw response body as a string */
	body: string;
}

// ─── LLM Proxy Protocol ───────────────────────────────────────────────────────

/**
 * LLM proxy request — sent from the sandbox to the host's LLM proxy endpoint.
 * The host resolves the LLM API key from the agent's model config and calls
 * the provider. The raw API key never enters the sandbox.
 *
 * The `messages` field mirrors pi-ai Context.messages (JSON-serializable).
 * The `tools` field mirrors pi-ai Tool[] (TypeBox schemas are plain JSON).
 */
export interface LlmProxyRequest {
	messages: unknown[]; // pi-ai Message[] — typed as unknown to avoid pi-ai import in shared types
	systemPrompt: string;
	tools?: unknown[]; // pi-ai Tool[]
	thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

// ─── Sandbox Token ────────────────────────────────────────────────────────────

/**
 * Payload of the PROXY_TOKEN JWT issued to each agent container.
 * Scoped to: one agent, one thread, one set of allowed credentials.
 * TTL: 15 minutes (refreshed if the agent needs more time via a keep-alive call).
 */
export interface SandboxTokenPayload {
	agentId: string;
	ownerId: string;
	threadId: string;
	/** IDs of credentials this sandbox is allowed to use via the proxy */
	credentialIds: string[];
	iat: number;
	exp: number;
}

/**
 * Minimal credential descriptor passed to the sandbox so the agent can
 * identify which credential belongs to which service.
 * Contains no secrets — only display metadata.
 */
export interface CredentialMeta {
	/** UUID used as credentialId in call_api */
	id: string;
	/** Human-readable name the user gave this credential (e.g. "My GitHub Token") */
	name: string;
	/**
	 * Integration definition ID — matches the YAML filename (e.g. "github",
	 * "google-workspace", "openweathermap"). Tells the agent which service
	 * this credential was created for.
	 */
	integration: string;
	/**
	 * OAuth2 scope string from the integration definition (space-separated scopes).
	 * Only present for OAuth2 credentials that declare a scope in their YAML.
	 * The agent must restrict API calls to operations covered by these scopes.
	 * Absent for non-OAuth2 credentials or OAuth2 credentials with no declared scope.
	 */
	scopes?: string;
	/**
	 * Non-secret credential properties (string/number/boolean fields, never `secret`-typed).
	 * Contains values like `baseUrl`, `host`, `port` that the agent needs to construct
	 * API request URLs. Secret-typed fields (API keys, tokens, passwords) are never included.
	 * Only present when the credential definition has non-secret properties.
	 */
	properties?: Record<string, string>;
}

/**
 * Agent runtime config delivered to the sandbox on startup.
 * Contains everything the agent-runtime needs to operate — no secrets.
 */
export interface AgentRuntimeConfig {
	agentId: string;
	/** Owner of this agent — required by host to scope memory embedding calls */
	ownerId: string;
	threadId: string;
	name: string;
	systemInstruction: string;
	/** Provider + model metadata — no API key */
	modelProvider: string;
	modelId: string;
	/** IDs of credentials available to this agent (used when calling the proxy) */
	credentialIds: string[];
	/**
	 * Rich credential metadata — includes name and integration for each credential.
	 * Used by the system prompt so the agent knows which credential belongs to
	 * which service. Replaces the UUID-only credentialIds list in the prompt.
	 */
	credentials: CredentialMeta[];
	/**
	 * Skills assigned to this agent — compact index only (name, description,
	 * workspace-relative SKILL.md path). Full instructions are materialized
	 * into <workspace>/skills/<name>/ by the backend before spawn; the agent
	 * reads them on demand via read_file (progressive disclosure).
	 */
	skills?: SkillRuntimeEntry[];
	/**
	 * LLM provider config ID used for memory embeddings.
	 * Null/empty means memory tools are unavailable for this agent.
	 */
	embeddingModelConfigId?: string;
	/**
	 * Knowledge base summary — present when the agent has ready knowledge
	 * assignments. fileNames is capped at 20 entries; used only to build the
	 * system-prompt note telling the agent to retrieve content via memory_search.
	 */
	knowledgeBase?: { fileCount: number; fileNames: string[] };
	triggerType: AgentTriggerType;
	triggerPayload?: Record<string, unknown>;
	/**
	 * ISO 8601 datetime string with timezone offset representing the user's local
	 * date and time at the moment the message was sent.
	 * Falls back to server time if absent (e.g. non-chat triggers like cron/webhook).
	 */
	userDatetime?: string;
	/**
	 * Present only for workflow runs (triggerType !== 'chat').
	 * Contains the full workflow definition (steps, etc.) and the normalized
	 * trigger context (type, triggerName, firedAt, payload) for the run.
	 * When present, workflow-runner.ts handles execution instead of agent-runner.ts.
	 */
	workflow?: {
		runId: string;
		definition: Workflow;
		triggerContext: WorkflowTriggerContext;
	};
}

// ─── SSE Event types (host → browser) ────────────────────────────────────────

// ─── HITL Protocol ────────────────────────────────────────────────────────────

/**
 * HITL request payload — sent from the agent sandbox to the host.
 * The host holds an open HTTP connection until the human responds.
 */
export interface HitlRequest {
	/** The question or instruction shown to the human operator */
	prompt: string;
	/**
	 * Optional list of pre-defined choices to present as buttons.
	 * If absent the human may type any free-form response.
	 */
	options?: string[];
}

/** HITL response returned from the host to the sandbox once the human replies */
export interface HitlResponse {
	/** The human operator's response text */
	response: string;
}

/** Discriminated union of all SSE events streamed to the browser */
export type AgentStreamEvent =
	| { type: 'message_start'; messageId: string; role: 'assistant' }
	| { type: 'text_delta'; messageId: string; delta: string }
	| { type: 'thinking_delta'; messageId: string; delta: string }
	/**
	 * Emitted when the LLM starts deciding on a tool call.
	 * toolName may be empty at this stage — wait for tool_call_delta.
	 */
	| { type: 'tool_call_start'; messageId: string; toolCallId: string; toolName: string }
	/**
	 * Emitted when the LLM finishes forming a tool call.
	 * Carries the real toolCallId, the tool name, and the JSON-formatted arguments
	 * (the "thinking context" — what the agent decided to pass to the tool).
	 */
	| {
			type: 'tool_call_delta';
			messageId: string;
			/** Temporary placeholder id used in tool_call_start (contentIndex as string) */
			placeholderId: string;
			/** The real tool call id assigned by the LLM provider */
			toolCallId: string;
			toolName: string;
			/** Pretty-printed JSON of the arguments the LLM chose to pass */
			argsJson: string;
	  }
	/**
	 * Emitted when the tool has finished executing and a result is available.
	 * result contains the raw tool execution output returned to the agent.
	 */
	| { type: 'tool_call_end'; messageId: string; toolCallId: string; result: string }
	| { type: 'message_end'; messageId: string; usage?: MessageTokenUsage }
	/**
	 * Emitted when the agent invokes the ask_human tool.
	 * The frontend should unlock ChatInput so the user can respond,
	 * and render a visual indicator that the agent is waiting.
	 */
	| { type: 'hitl_request'; prompt: string; options?: string[] }
	/**
	 * Emitted after the 2nd user message when an auto-generated title
	 * has been saved to the thread. The frontend should update the sidebar.
	 */
	| { type: 'thread_title_updated'; threadId: string; title: string }
	| { type: 'error'; message: string }
	| { type: 'done' };

// ─── Request/Response bodies ──────────────────────────────────────────────────

/** POST /v1/runtime/:agentId/threads — create a new chat thread */
export interface CreateThreadRequestBody {
	ownerId: string;
	title?: string;
}

/** POST /v1/runtime/:agentId/threads/:threadId/messages — send a user message */
export interface SendMessageRequestBody {
	ownerId: string;
	content: string; // plain text; backend wraps in ContentBlock[]
}

/** POST /v1/runtime/:agentId/triggers — create a trigger */
export interface CreateTriggerRequestBody {
	ownerId: string;
	kind: AgentTriggerKind;
	name: string;
	config: AgentTriggerConfig;
	description?: string;
}

/** PUT /v1/runtime/:agentId/triggers/:triggerId — update a trigger */
export interface UpdateTriggerRequestBody {
	name?: string;
	config?: AgentTriggerConfig;
	isEnabled?: boolean;
	description?: string;
}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export type AgentThreadResponse = ApiResponse<AgentThread>;
export type AgentThreadsListResponse = ApiResponse<AgentThread[]>;
export type AgentThreadDeleteResponse = ApiResponse<{ deleted: boolean }>;
export type AgentMessageResponse = ApiResponse<AgentMessage>;
export type AgentMessagesListResponse = ApiResponse<AgentMessage[]>;
export type AgentTriggerResponse = ApiResponse<AgentTrigger>;
export type AgentTriggersListResponse = ApiResponse<AgentTrigger[]>;
export type AgentTriggerDeleteResponse = ApiResponse<{ deleted: boolean }>;

/** PATCH /v1/runtime/:agentId/threads/:threadId — rename a thread */
export interface RenameThreadRequestBody {
	title: string;
}
