import type { ApiResponse } from './api.js';

// ─── Channel type ─────────────────────────────────────────────────────────────

/**
 * Supported messaging channel types.
 * 'web' is the built-in browser UI; all others are external platform integrations.
 */
export type ChannelType = 'web' | 'telegram' | 'whatsapp' | 'discord';

// ─── Thread mode ──────────────────────────────────────────────────────────────

/**
 * Controls whether the channel link resumes a single persistent thread or
 * auto-creates a new thread after a period of inactivity.
 *
 * 'persistent' — all messages go to the same thread until the user explicitly
 *   switches with a /new or /thread command.
 * 'per_session' — a new thread is auto-created when the last message in the
 *   active thread is older than sessionTimeoutMin minutes.
 */
export type ChannelThreadMode = 'persistent' | 'per_session';

// ─── Channel link ─────────────────────────────────────────────────────────────

/**
 * A verified pairing between a platform identity (e.g. Telegram chat_id)
 * and an internal user account + agent.
 */
export interface ChannelLink {
	id: string;
	userId: string;
	/** Platform identifier, e.g. 'telegram', 'whatsapp' */
	channel: ChannelType;
	/** Platform-specific user ID (Telegram chat_id, WhatsApp phone number, etc.) */
	externalId: string;
	/** Currently active agent for this channel link */
	agentId: string;
	/** Currently active thread — null until the first message is sent */
	activeThreadId?: string;
	/** Controls thread session behaviour */
	threadMode: ChannelThreadMode;
	/** Inactivity threshold in minutes for per_session mode (default 60) */
	sessionTimeoutMin: number;
	/** When true, the bot sends "🔧 Using {toolName}..." messages during agent turns */
	notifyToolUsage: boolean;
	/** Platform display name (e.g. Telegram username) */
	displayName?: string;
	/**
	 * The credential holding the bot token for this channel.
	 * Null for the web channel. Required for Telegram, WhatsApp, etc.
	 */
	credentialId?: string;
	/** True after the pairing code has been successfully consumed */
	isVerified: boolean;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Pairing code ─────────────────────────────────────────────────────────────

/**
 * A one-time pairing code generated from the Web UI.
 * The user sends this code to the bot to link their account.
 */
export interface ChannelPairingCode {
	id: string;
	userId: string;
	/** 6-character alphanumeric code */
	code: string;
	/** Which channel this code is for */
	channel: ChannelType;
	/** Pre-selected agent to bind on pairing */
	agentId: string;
	/** When this code expires (10-minute TTL) */
	expiresAt: Date;
	/** When the code was consumed — null if not yet used */
	consumedAt?: Date;
}

// ─── Inbound message ─────────────────────────────────────────────────────────

/**
 * Normalized incoming message from any channel, with all identity fields resolved.
 * Produced by ChannelAdapter.handleInbound() and consumed by MessagePipeline.process().
 */
export interface InboundMessage {
	channel: ChannelType;
	/** Platform-specific sender ID. For web: the userId directly */
	externalId: string;
	/** Resolved internal user ID */
	userId: string;
	/** Resolved agent ID */
	agentId: string;
	/** Resolved thread ID (may be a newly created thread ID) */
	threadId: string;
	/** Normalized content blocks from the platform message */
	content: InboundContent[];
	/** Raw platform-specific metadata for debugging — not processed by the pipeline */
	platformMeta?: Record<string, unknown>;
	/** User's local datetime (if available from the platform) */
	userDatetime?: string;
	/**
	 * Per-link setting resolved by the adapter from the channel link:
	 * when true the stream subscriber sends "🔧 Using {toolName}…" notifications
	 * while the agent runs tools. Always false/undefined for the web channel.
	 */
	notifyToolUsage?: boolean;
}

/**
 * A single piece of content in an inbound message.
 * Media items (voice, image, document, video) use a ref (local file path)
 * rather than raw bytes — the adapter downloads the file and passes the path.
 * ContentProcessor converts these refs into ContentBlock[] for the agent runtime.
 */
export type InboundContent =
	| { type: 'text'; text: string }
	| { type: 'voice'; ref: string; mimeType: string; durationMs?: number }
	| { type: 'image'; ref: string; mimeType: string; caption?: string }
	| { type: 'document'; ref: string; mimeType: string; filename: string }
	| { type: 'video'; ref: string; mimeType: string; durationMs?: number }
	| { type: 'location'; latitude: number; longitude: number }
	/**
	 * A file already stored as a chat_files row (web uploads): the ref is the
	 * chat_files id, not a local path. ContentProcessor resolves it to the stored
	 * bytes / extracted text. Distinct from 'image'/'document' which carry a
	 * freshly-downloaded local path from an external channel.
	 */
	| { type: 'file'; fileId: string }
	/** Internal channel commands (e.g. /new, /agents) — handled before pipeline */
	| { type: 'command'; command: string; args: string[] };

// ─── Outbound message ─────────────────────────────────────────────────────────

/**
 * A message to be sent from the backend to a user on a platform.
 * Produced by the channel stream subscriber and consumed by the ChannelAdapter.send().
 */
export interface OutboundMessage {
	channel: ChannelType;
	externalId: string;
	content: OutboundContent[];
}

export type OutboundContent =
	/** Markdown text — each adapter's formatter converts to platform-native format */
	| { type: 'text'; text: string }
	| { type: 'image'; ref: string; mimeType: string; caption?: string }
	| { type: 'document'; ref: string; mimeType: string; filename: string }
	/** Signals the platform to show a "typing..." indicator */
	| { type: 'typing' }
	/** Inline action buttons (e.g. HITL options) — rendered as platform buttons */
	| { type: 'action_buttons'; buttons: Array<{ label: string; payload: string }> };

// ─── Pipeline result ──────────────────────────────────────────────────────────

/**
 * Result returned by MessagePipeline.process().
 * Used by the route handler to send the appropriate HTTP response.
 */
export type PipelineResult =
	| {
			ok: true;
			/** HTTP status to respond with (201 for new message) */
			status: 201;
			/** The persisted user message */
			userMessage: import('./agentRuntime.js').AgentMessage;
			/** The thread ID (may differ from input if auto-created) */
			threadId: string;
			/** True if this message resolved a pending HITL request */
			hitlResolved?: boolean;
	  }
	| { ok: false; status: 400 | 401 | 404 | 409 | 500; error: string };

// ─── Request/Response bodies ──────────────────────────────────────────────────

/** POST /v1/channels/pairing-codes — generate a one-time pairing code */
export interface GeneratePairingCodeRequestBody {
	channel: ChannelType;
	agentId: string;
}

/** PATCH /v1/channels/:linkId — update channel link settings */
export interface UpdateChannelLinkRequestBody {
	agentId?: string;
	threadMode?: ChannelThreadMode;
	sessionTimeoutMin?: number;
	notifyToolUsage?: boolean;
}

// ─── Channel adapter interfaces ───────────────────────────────────────────────

/**
 * Subscriber that receives agent stream events and delivers responses back
 * to the originating channel.
 *
 * Streaming channels (web): return a no-op — the browser EventSource already
 * subscribes to AgentStreamBus directly.
 *
 * Batched channels (telegram, whatsapp): accumulate text_delta events and
 * dispatch the full response on message_end / done.
 */
export interface ChannelStreamSubscriber {
	/** Called for each AgentStreamEvent emitted on the AgentStreamBus */
	onEvent(event: import('./agentRuntime.js').AgentStreamEvent): void;
	/** Called when the agent turn is fully complete (after 'done' event) */
	onComplete(): void;
	/** Release any resources held by this subscriber */
	dispose(): void;
}

/**
 * Per-link delivery settings passed to ChannelAdapter.createStreamSubscriber().
 * Resolved from the channel link by the adapter that produced the InboundMessage.
 */
export interface ChannelSubscriberOptions {
	/** When true, send "🔧 Using {toolName}…" notifications during tool execution */
	notifyToolUsage?: boolean;
}

/**
 * Context object passed to ChannelAdapter.handleInbound().
 * Contains the raw HTTP request data needed by the adapter to parse and
 * authenticate the incoming message.
 */
export interface AdapterInboundContext {
	/** Raw parsed body from the platform webhook */
	rawBody: unknown;
	headers: Record<string, string | string[] | undefined>;
	params: Record<string, string>;
	query: Record<string, string | string[] | undefined>;
}

/**
 * Standard interface every channel adapter must implement.
 * Each adapter encapsulates all platform-specific concerns:
 *   - Authentication / webhook signature verification
 *   - Parsing the raw payload into an InboundMessage
 *   - Delivering outbound messages in the platform's format
 *   - Creating a ChannelStreamSubscriber appropriate for this channel's delivery model
 */
export interface ChannelAdapter {
	/** Unique channel identifier, e.g. 'web', 'telegram', 'whatsapp' */
	readonly channel: string;

	/**
	 * Delivery model for this adapter.
	 * 'streaming' — web: SSE handles delivery; createStreamSubscriber returns a no-op.
	 * 'batched'   — telegram/whatsapp: subscriber accumulates and sends on completion.
	 */
	readonly deliveryMode: 'streaming' | 'batched';

	/**
	 * Parse an incoming platform event into a resolved InboundMessage.
	 * Returns null if the event was handled internally (e.g. /pair command)
	 * and must not be forwarded to the message pipeline.
	 */
	handleInbound(context: AdapterInboundContext): Promise<InboundMessage | null>;

	/**
	 * Create a stream subscriber for a given thread + externalId combination.
	 * The pipeline registers it on AgentStreamBus immediately after spawning
	 * the agent child process. `options` carries per-link delivery settings
	 * (e.g. notifyToolUsage) resolved by the adapter that handled the inbound message.
	 */
	createStreamSubscriber(
		threadId: string,
		externalId: string,
		options?: ChannelSubscriberOptions,
	): ChannelStreamSubscriber;

	/** Send a message to a user on this platform. */
	send(message: OutboundMessage): Promise<void>;
}

// ─── API response envelopes ───────────────────────────────────────────────────

export type ChannelLinkResponse = ApiResponse<ChannelLink>;
export type ChannelLinksListResponse = ApiResponse<ChannelLink[]>;
export type ChannelLinkDeleteResponse = ApiResponse<{ deleted: boolean }>;
export type ChannelPairingCodeResponse = ApiResponse<{ code: string; expiresAt: Date }>;
