import type {
	ProxyRequest,
	ProxyResponse,
	AgentMessage,
	AgentRuntimeConfig,
	LlmProxyRequest,
	ContentBlock,
	HitlRequest,
	HitlResponse,
} from '@repo/types';

/**
 * HTTP client for communication between the agent sandbox and the host backend.
 *
 * All requests are authenticated with the PROXY_TOKEN — a short-lived JWT scoped
 * to this agent/thread/credential-set. The token is never persisted; it is passed
 * in as a constructor argument from the environment at container startup.
 *
 * Endpoints used:
 *   POST /v1/runtime/internal/proxy                — credential API proxy
 *   POST /v1/runtime/internal/llm/stream           — LLM completion proxy
 *   GET  /v1/runtime/internal/thread/:id/messages  — load conversation history
 *   POST /v1/runtime/internal/thread/:id/messages  — append a message
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
			{ headers: this.authHeaders() },
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
