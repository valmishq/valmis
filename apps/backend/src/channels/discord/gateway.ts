import WebSocket, { type RawData } from 'ws';
import { logger } from '../../config/logger.js';
import type { DiscordMessageCreateEvent, DiscordInteraction } from './bot-api.js';

/**
 * Discord Gateway opcodes (partial — only the ones we handle).
 * See https://discord.com/developers/docs/topics/opcodes-and-status-codes
 */
const GatewayOpcodes = {
	DISPATCH: 0,
	HEARTBEAT: 1,
	IDENTIFY: 2,
	RESUME: 6,
	RECONNECT: 7,
	INVALID_SESSION: 9,
	HELLO: 10,
	HEARTBEAT_ACK: 11,
} as const;

/**
 * Gateway Intents bitmask.
 * We request only what is needed for DM text messaging:
 *   GUILD_MESSAGES (1 << 9)       = 512  — needed for guild message events
 *   DIRECT_MESSAGES (1 << 12)     = 4096 — DM messages
 *   MESSAGE_CONTENT (1 << 15)     = 32768 — privileged: required to read message text
 *
 * MESSAGE_CONTENT is a privileged intent and must be enabled in the
 * Discord Developer Portal under Bot → Privileged Gateway Intents.
 */
const GATEWAY_INTENTS = 512 | 4096 | 32768;

/** Gateway API version */
const GATEWAY_VERSION = 10;

/** How long to wait before attempting a full reconnect (ms) */
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;

/** Payload received from the Gateway WebSocket */
interface GatewayPayload {
	op: number;
	d: unknown;
	s?: number;
	t?: string;
}

/**
 * Callbacks the adapter provides to receive incoming events.
 */
export interface DiscordGatewayCallbacks {
	/** Called when a MESSAGE_CREATE event arrives that should be processed */
	onMessage(event: DiscordMessageCreateEvent): Promise<void>;
	/** Called when an INTERACTION_CREATE event arrives (button click) */
	onInteraction(event: DiscordInteraction): Promise<void>;
}

/**
 * DiscordGateway — WebSocket connection to the Discord Gateway.
 *
 * Handles:
 *   - Initial connection and IDENTIFY
 *   - Heartbeat loop (interval from HELLO opcode)
 *   - DISPATCH events (MESSAGE_CREATE, INTERACTION_CREATE)
 *   - Session resume after network disconnects
 *   - Exponential backoff reconnect on errors
 *   - Graceful shutdown via stop()
 *
 * One DiscordGateway instance per bot credential.
 */
export class DiscordGateway {
	private ws: WebSocket | null = null;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private heartbeatAcked = true;
	private sequence: number | null = null;
	private sessionId: string | null = null;
	private resumeGatewayUrl: string | null = null;
	private reconnectDelay = RECONNECT_DELAY_MS;
	private running = false;
	/** The bot's own user ID — set on READY, used to filter self-messages */
	private botUserId: string | null = null;

	constructor(
		/** Bot token for IDENTIFY */
		private readonly botToken: string,
		/** Callbacks to forward events to the adapter */
		private readonly callbacks: DiscordGatewayCallbacks,
		/** credentialId — used only for logging context */
		private readonly credentialId: string,
		/** Gateway URL from getGatewayBot() */
		private readonly gatewayUrl: string,
	) {}

	/**
	 * Connect to the Gateway and start the event loop.
	 * Non-blocking — runs in the background.
	 */
	start(): void {
		if (this.running) return;
		this.running = true;
		this.connect();
	}

	/** Signal the gateway to stop and close the connection. */
	stop(): void {
		this.running = false;
		this.clearHeartbeat();
		if (this.ws) {
			this.ws.close(1000, 'Shutdown');
			this.ws = null;
		}
		logger.info({ credentialId: this.credentialId }, '[discord-gateway] stopped');
	}

	// ─── Private connection management ───────────────────────────────────────

	private connect(): void {
		const url =
			this.resumeGatewayUrl && this.sessionId
				? `${this.resumeGatewayUrl}?v=${GATEWAY_VERSION}&encoding=json`
				: `${this.gatewayUrl}?v=${GATEWAY_VERSION}&encoding=json`;

		logger.info(
			{ credentialId: this.credentialId, url: url.split('?')[0] },
			'[discord-gateway] connecting',
		);

		this.ws = new WebSocket(url);

		this.ws.on('open', () => {
			logger.debug({ credentialId: this.credentialId }, '[discord-gateway] ws open');
			this.reconnectDelay = RECONNECT_DELAY_MS;
		});

		this.ws.on('message', (data: RawData) => {
			try {
				const payload = JSON.parse(data.toString()) as GatewayPayload;
				this.handlePayload(payload);
			} catch (err) {
				logger.warn({ err, credentialId: this.credentialId }, '[discord-gateway] parse error');
			}
		});

		this.ws.on('close', (code: number, reason: Buffer) => {
			this.clearHeartbeat();
			logger.info(
				{ code, reason: reason.toString(), credentialId: this.credentialId },
				'[discord-gateway] ws closed',
			);

			if (!this.running) return;

			// Some close codes are non-resumable — reset session
			if (code === 4004 || code === 4010 || code === 4011 || code === 4012 || code === 4013) {
				logger.warn(
					{ code, credentialId: this.credentialId },
					'[discord-gateway] non-resumable close code — resetting session',
				);
				this.sessionId = null;
				this.resumeGatewayUrl = null;
				this.sequence = null;
			}

			this.scheduleReconnect();
		});

		this.ws.on('error', (err: Error) => {
			logger.warn({ err, credentialId: this.credentialId }, '[discord-gateway] ws error');
		});
	}

	private scheduleReconnect(): void {
		if (!this.running) return;
		logger.info(
			{ delayMs: this.reconnectDelay, credentialId: this.credentialId },
			'[discord-gateway] scheduling reconnect',
		);
		setTimeout(() => {
			if (this.running) this.connect();
		}, this.reconnectDelay);
		// Exponential backoff
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
	}

	// ─── Payload handling ─────────────────────────────────────────────────────

	private handlePayload(payload: GatewayPayload): void {
		// Update sequence number for heartbeat and resume
		if (payload.s !== null && payload.s !== undefined) {
			this.sequence = payload.s;
		}

		switch (payload.op) {
			case GatewayOpcodes.HELLO:
				this.handleHello(payload.d as { heartbeat_interval: number });
				break;

			case GatewayOpcodes.DISPATCH:
				this.handleDispatch(payload.t ?? '', payload.d);
				break;

			case GatewayOpcodes.HEARTBEAT:
				// Server requests an immediate heartbeat
				this.sendHeartbeat();
				break;

			case GatewayOpcodes.HEARTBEAT_ACK:
				this.heartbeatAcked = true;
				break;

			case GatewayOpcodes.RECONNECT:
				// Server requests a reconnect (with resume)
				logger.info(
					{ credentialId: this.credentialId },
					'[discord-gateway] server requested reconnect',
				);
				this.ws?.close(4000, 'Server reconnect');
				break;

			case GatewayOpcodes.INVALID_SESSION: {
				const resumable = payload.d === true;
				logger.warn(
					{ resumable, credentialId: this.credentialId },
					'[discord-gateway] invalid session',
				);
				if (!resumable) {
					this.sessionId = null;
					this.resumeGatewayUrl = null;
					this.sequence = null;
				}
				// Small delay before reconnecting per Discord docs
				setTimeout(
					() => {
						if (this.running) this.ws?.close(4000, 'Invalid session');
					},
					1000 + Math.random() * 4000,
				);
				break;
			}
		}
	}

	private handleHello(d: { heartbeat_interval: number }): void {
		this.clearHeartbeat();
		this.heartbeatAcked = true;

		// Jitter on first heartbeat per Discord docs
		const jitter = Math.random() * d.heartbeat_interval;
		setTimeout(() => {
			this.sendHeartbeat();
			this.heartbeatInterval = setInterval(() => {
				if (!this.heartbeatAcked) {
					// Zombie connection — force reconnect
					logger.warn(
						{ credentialId: this.credentialId },
						'[discord-gateway] heartbeat not acked — reconnecting',
					);
					this.ws?.close(4000, 'Heartbeat timeout');
					return;
				}
				this.sendHeartbeat();
			}, d.heartbeat_interval);
		}, jitter);

		// After HELLO, either RESUME or IDENTIFY
		if (this.sessionId && this.sequence !== null) {
			this.sendResume();
		} else {
			this.sendIdentify();
		}
	}

	private handleDispatch(event: string, data: unknown): void {
		switch (event) {
			case 'READY': {
				const ready = data as {
					session_id: string;
					resume_gateway_url: string;
					user: { id: string };
				};
				this.sessionId = ready.session_id;
				this.resumeGatewayUrl = ready.resume_gateway_url;
				this.botUserId = ready.user.id;
				this.reconnectDelay = RECONNECT_DELAY_MS;
				logger.info(
					{ credentialId: this.credentialId, botUserId: this.botUserId },
					'[discord-gateway] ready',
				);
				break;
			}

			case 'RESUMED':
				logger.info({ credentialId: this.credentialId }, '[discord-gateway] resumed');
				break;

			case 'MESSAGE_CREATE': {
				const msg = data as DiscordMessageCreateEvent;
				// Skip messages from the bot itself
				if (msg.author.id === this.botUserId) break;
				// Skip system messages (type 0 = default user message)
				if (msg.type !== 0) break;
				// Only handle DMs (channel type 1) — guild messages ignored
				// Note: guild_id is absent for DMs
				if (msg.guild_id) break;

				this.callbacks.onMessage(msg).catch((err: unknown) => {
					logger.error(
						{ err, credentialId: this.credentialId },
						'[discord-gateway] onMessage callback error',
					);
				});
				break;
			}

			case 'INTERACTION_CREATE': {
				const interaction = data as DiscordInteraction;
				// type 2 = APPLICATION_COMMAND (slash command), type 3 = MESSAGE_COMPONENT (button click)
				if (interaction.type !== 2 && interaction.type !== 3) break;

				this.callbacks.onInteraction(interaction).catch((err: unknown) => {
					logger.error(
						{ err, credentialId: this.credentialId },
						'[discord-gateway] onInteraction callback error',
					);
				});
				break;
			}
		}
	}

	// ─── Gateway sends ─────────────────────────────────────────────────────────

	private send(payload: GatewayPayload): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify(payload));
	}

	private sendHeartbeat(): void {
		this.heartbeatAcked = false;
		this.send({ op: GatewayOpcodes.HEARTBEAT, d: this.sequence });
	}

	private sendIdentify(): void {
		this.send({
			op: GatewayOpcodes.IDENTIFY,
			d: {
				token: this.botToken,
				intents: GATEWAY_INTENTS,
				properties: {
					os: 'linux',
					browser: 'openagent',
					device: 'openagent',
				},
			},
		});
	}

	private sendResume(): void {
		this.send({
			op: GatewayOpcodes.RESUME,
			d: {
				token: this.botToken,
				session_id: this.sessionId,
				seq: this.sequence,
			},
		});
	}

	private clearHeartbeat(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
	}
}
