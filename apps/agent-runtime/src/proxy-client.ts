import type {
	ProxyRequest,
	ProxyResponse,
	AgentMessage,
	AgentRuntimeConfig,
	LlmProxyRequest,
	ContentBlock,
	HitlRequest,
	HitlResponse,
	MemoryWriteRequest,
	MemorySearchRequest,
	MemoryDeleteRequest,
	MemoryDeleteResponse,
	BrowserActionRequest,
	BrowserActionResult,
	SkillTraceRequestBody,
	AgentMemoryEntry,
	AgentMemorySearchResult,
	WorkflowRunStatus,
	WorkflowStepLogStatus,
	WorkflowSummary,
	Workflow,
	WorkflowSpec,
} from '@repo/types';

// Per-call request timeouts. Without them, an unreachable backend (e.g. a runtime
// container that cannot resolve PROXY_HOST in a misconfigured Docker deployment)
// makes every fetch hang until the host's 40-min hard kill — orphaning the run and
// holding a concurrency slot. Tight on control-plane calls that only touch the
// backend DB; generous on the two calls that can legitimately run for minutes (LLM
// completion and the credential-proxied external API). Both overridable via env.
const CONTROL_TIMEOUT_MS = parseInt(process.env.RUNTIME_PROXY_CONTROL_TIMEOUT_MS ?? '120000', 10);
const IO_TIMEOUT_MS = parseInt(process.env.RUNTIME_PROXY_IO_TIMEOUT_MS ?? '600000', 10);

/**
 * HTTP client for communication between the agent sandbox and the host backend.
 *
 * All requests are authenticated with the PROXY_TOKEN — a short-lived JWT scoped
 * to this agent/thread/credential-set. The token is never persisted; it is passed
 * in as a constructor argument from the environment at container startup.
 *
 * Endpoints used:
 *   POST /v1/runtime/internal/proxy                  — credential API proxy
 *   POST /v1/runtime/internal/llm/stream             — LLM completion proxy
 *   GET  /v1/runtime/internal/thread/:id/messages    — load conversation history
 *   POST /v1/runtime/internal/thread/:id/messages    — append a message
 *   POST /v1/runtime/internal/memory/write           — write a memory entry (host embeds + stores)
 *   POST /v1/runtime/internal/memory/search          — search memory by semantic similarity
 *   POST /v1/runtime/internal/skills/trace           — record a skill execution trace
 *   POST /v1/runtime/internal/workflow/step-start    — log workflow step start
 *   POST /v1/runtime/internal/workflow/step-end      — log workflow step completion
 *   POST /v1/runtime/internal/workflow/run-complete  — mark workflow run complete
 */
export class ProxyClient {
	private readonly baseUrl: string;
	private readonly proxyToken: string;
	private readonly threadId: string;

	constructor(proxyHost: string, proxyToken: string, threadId: string) {
		this.baseUrl = proxyHost;
		this.proxyToken = proxyToken;
		this.threadId = threadId;
	}

	// ─── Auth helper ──────────────────────────────────────────────────────────

	private authHeaders(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.proxyToken}`,
			'Content-Type': 'application/json',
		};
	}

	// ─── Credential proxy ─────────────────────────────────────────────────────

	/**
	 * Execute an authenticated API call via the host credential proxy.
	 * The host resolves the credential, executes the HTTP request, and returns
	 * the response. Raw credential values never enter this process.
	 */
	async proxy(request: ProxyRequest): Promise<ProxyResponse> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/proxy`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(IO_TIMEOUT_MS),
		});

		const json = (await res.json()) as { success: boolean; data?: ProxyResponse; error?: string };
		if (!json.success || !json.data) {
			throw new Error(`Proxy request failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	// ─── LLM proxy ────────────────────────────────────────────────────────────

	/**
	 * Execute an LLM completion via the host LLM proxy.
	 * The host resolves the API key, calls the LLM provider, streams events to
	 * the browser, persists the assistant message, and returns the content blocks
	 * so the agent loop can continue its tool execution cycle.
	 */
	async llmStream(request: LlmProxyRequest): Promise<ContentBlock[]> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/llm/stream`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(IO_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: { content: ContentBlock[] };
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`LLM proxy failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data.content;
	}

	// ─── Message history ─────────────────────────────────────────────────────

	/** Load the full conversation history for this thread */
	async loadMessages(): Promise<AgentMessage[]> {
		const res = await fetch(
			`${this.baseUrl}/v1/runtime/internal/thread/${this.threadId}/messages`,
			{ headers: this.authHeaders(), signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS) },
		);

		const json = (await res.json()) as {
			success: boolean;
			data?: AgentMessage[];
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Failed to load messages: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	/** Append a tool result message to the thread */
	async appendToolResult(input: {
		toolCallId: string;
		toolName: string;
		content: ContentBlock[];
	}): Promise<void> {
		const res = await fetch(
			`${this.baseUrl}/v1/runtime/internal/thread/${this.threadId}/messages`,
			{
				method: 'POST',
				headers: this.authHeaders(),
				body: JSON.stringify({
					role: 'tool_result',
					content: input.content,
					toolCallId: input.toolCallId,
					toolName: input.toolName,
				}),
				signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
			},
		);

		const json = (await res.json()) as { success: boolean; error?: string };
		if (!json.success) {
			throw new Error(`Failed to append tool result: ${json.error ?? 'unknown error'}`);
		}
	}

	// ─── HITL ─────────────────────────────────────────────────────────────────

	/**
	 * Block execution until a human operator responds.
	 *
	 * Calls POST /v1/runtime/internal/hitl/request — this is a long-polling
	 * request that holds the HTTP connection open until the backend resolves it
	 * (when the human sends their next chat message).
	 *
	 * Uses a 35-minute timeout — slightly longer than the backend's 30-minute
	 * HITL window to avoid a Node fetch timeout racing the backend reject.
	 */
	async hitlRequest(request: HitlRequest): Promise<HitlResponse> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/hitl/request`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(35 * 60 * 1000),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: HitlResponse;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`HITL request failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	// ─── Memory ───────────────────────────────────────────────────────────────

	/**
	 * Write a memory entry for this agent.
	 *
	 * The host embeds the content using the agent's configured embedding model
	 * and persists the entry to the agent_memory table. The sandbox never calls
	 * the embedding API directly — no API keys are available here.
	 *
	 * agentId is derived from the PROXY_TOKEN on the host; the sandbox cannot
	 * write to another agent's memory.
	 */
	async memoryWrite(request: MemoryWriteRequest): Promise<AgentMemoryEntry> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/memory/write`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: AgentMemoryEntry;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Memory write failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	/**
	 * Search this agent's memory by semantic similarity.
	 *
	 * The host embeds the query text and returns the nearest memory entries
	 * ranked by cosine similarity. The sandbox cannot access another agent's memory.
	 */
	async memorySearch(request: MemorySearchRequest): Promise<AgentMemorySearchResult[]> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/memory/search`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: AgentMemorySearchResult[];
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Memory search failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	/**
	 * Delete one or more memory entries for this agent.
	 *
	 * The host enforces the agentId from the PROXY_TOKEN — the sandbox cannot
	 * delete memory entries belonging to any other agent.
	 *
	 * @returns { deletedCount } — number of rows actually removed.
	 */
	async memoryDelete(request: MemoryDeleteRequest): Promise<MemoryDeleteResponse> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/memory/delete`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: MemoryDeleteResponse;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Memory delete failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	// ─── Skill traces ─────────────────────────────────────────────────────────

	/**
	 * Record one skill execution trace for the evolution engine.
	 * The host enforces the agentId from the PROXY_TOKEN and validates that the
	 * skill is actually assigned to this agent.
	 */
	async recordSkillTrace(request: SkillTraceRequestBody): Promise<void> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/skills/trace`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as { success: boolean; error?: string };
		if (!json.success) {
			throw new Error(`Skill trace failed: ${json.error ?? 'unknown error'}`);
		}
	}

	// ─── Workflow step logging ────────────────────────────────────────────────

	/**
	 * Log the start of a workflow step execution.
	 * Returns the stepLogId to be used when logging the step's completion.
	 */
	async logWorkflowStepStart(input: {
		runId: string;
		stepId: string;
		stepIndex: number;
		stepName: string;
		inputContext: Record<string, unknown>;
		attemptNumber?: number;
	}): Promise<string> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/step-start`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: { stepLogId: string };
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Workflow step start failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data.stepLogId;
	}

	/**
	 * Log the completion (success, failed, or skipped) of a workflow step.
	 */
	async logWorkflowStepEnd(input: {
		stepLogId: string;
		status: WorkflowStepLogStatus;
		outputData?: Record<string, unknown>;
		error?: string;
	}): Promise<void> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/step-end`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as { success: boolean; error?: string };
		if (!json.success) {
			throw new Error(`Workflow step end failed: ${json.error ?? 'unknown error'}`);
		}
	}

	/**
	 * Mark a workflow run as completed or errored.
	 * Called after all steps finish (or on a fatal failure that stops the pipeline).
	 */
	async completeWorkflowRun(input: {
		runId: string;
		status: WorkflowRunStatus;
		error?: string;
	}): Promise<void> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/run-complete`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as { success: boolean; error?: string };
		if (!json.success) {
			throw new Error(`Workflow run complete failed: ${json.error ?? 'unknown error'}`);
		}
	}

	// ─── Workflow agent tools ─────────────────────────────────────────────────

	/**
	 * List all enabled workflows for this agent.
	 * The host scopes the query to sandboxToken.agentId.
	 */
	async listWorkflows(): Promise<WorkflowSummary[]> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/list`, {
			headers: this.authHeaders(),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: WorkflowSummary[];
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`List workflows failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	/**
	 * Read the full definition of a single workflow (including steps).
	 * Only workflows belonging to this agent are accessible.
	 */
	async readWorkflow(workflowId: string): Promise<Workflow> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/${workflowId}`, {
			headers: this.authHeaders(),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: Workflow;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Read workflow failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	/**
	 * Create a new workflow for this agent.
	 * The agent provides name, description, step definitions, and optional trigger config.
	 * The host validates (via Zod) and persists the workflow + trigger.
	 * Returns the full created Workflow object including its trigger and generated ID.
	 */
	async createWorkflow(input: {
		name: string;
		description?: string;
		/** Linear sequence of steps. Provide this OR `graph` (for branching/looping). */
		steps?: Array<{
			name: string;
			instruction: string;
			allowedTools?: string[];
			allowedCredentialIds?: string[];
			errorHandlingAction?: 'stop' | 'continue' | 'retry';
		}>;
		/** High-level graph spec for branching (conditions) and loops. */
		graph?: WorkflowSpec;
		trigger?: {
			kind?: 'manual' | 'cron' | 'webhook';
			name?: string;
			/** For cron: { schedule, timezone? }. For manual/webhook: omit. */
			config?: Record<string, string>;
			description?: string;
		};
	}): Promise<Workflow> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/create`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: Workflow;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Create workflow failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	/**
	 * Trigger a workflow run (fire-and-forget).
	 * The host creates a workflow_run record and spawns a new child process.
	 * Returns immediately with the runId.
	 */
	async triggerWorkflow(
		workflowId: string,
		payload?: Record<string, string | number | boolean | null>,
	): Promise<{ runId: string }> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/workflow/${workflowId}/trigger`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify({ payload }),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: { runId: string };
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Trigger workflow failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	// ─── Browser ──────────────────────────────────────────────────────────────

	/**
	 * Execute one browser command via the host-managed browser.
	 *
	 * The host owns the browser (a separate container or a local Playwright
	 * instance) and enforces the hard gate (project feature flag + a live DB read
	 * of the agent's internet-access setting). Uses the long IO timeout because
	 * navigation / screenshots can take many seconds.
	 */
	async browserAction(request: BrowserActionRequest): Promise<BrowserActionResult> {
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/browser/action`, {
			method: 'POST',
			headers: this.authHeaders(),
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(IO_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: BrowserActionResult;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Browser action failed: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}

	// ─── Config ───────────────────────────────────────────────────────────────

	/** Load agent runtime config from the host */
	async loadConfig(): Promise<AgentRuntimeConfig> {
		const configEnv = process.env.RUNTIME_CONFIG;
		if (configEnv) {
			// Config is pre-injected as env var by AgentRuntimeService — no round-trip needed
			return JSON.parse(configEnv) as AgentRuntimeConfig;
		}

		// Fallback: fetch from host (e.g. for long-running containers)
		const res = await fetch(`${this.baseUrl}/v1/runtime/internal/config`, {
			headers: this.authHeaders(),
			signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
		});

		const json = (await res.json()) as {
			success: boolean;
			data?: AgentRuntimeConfig;
			error?: string;
		};
		if (!json.success || !json.data) {
			throw new Error(`Failed to load config: ${json.error ?? 'unknown error'}`);
		}
		return json.data;
	}
}
