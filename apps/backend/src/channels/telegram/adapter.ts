import type {
	ChannelAdapter,
	ChannelStreamSubscriber,
	ChannelSubscriberOptions,
	InboundMessage,
	OutboundMessage,
	AdapterInboundContext,
} from '@repo/types';
import { TelegramBotApi } from './bot-api.js';
import { toTelegramHtml, splitForTelegram } from './formatter.js';
import { handleChannelCommand } from '../commands.js';
import { resolveActiveThread } from '../thread-routing.js';
import { createBatchedSubscriber, type BatchedDelivery } from '../batched-subscriber.js';
import type { ChannelService } from '../../services/ChannelService.js';
import type { AgentService } from '../../services/AgentService.js';
import type { AgentSessionService } from '../../services/AgentSessionService.js';
import { logger } from '../../config/logger.js';

/** How often to re-send the typing indicator while the agent is working (ms) */
const TYPING_REFRESH_MS = 4000;

/**
 * TelegramAdapter — batched delivery model.
 *
 * Receives messages via long polling (TelegramPoller).
 * Delivers responses by accumulating text_delta events and sending the
 * full response as a single Telegram message on completion.
 *
 * The handleInbound() method is called by TelegramPoller for every incoming
 * Telegram Update. It:
 *   1. Detects /commands and routes them to handleChannelCommand()
 *   2. Looks up the channel_link for the sender
 *   3. Checks per_session thread expiry and auto-creates a new thread if needed
 *   4. Returns a fully resolved InboundMessage for the pipeline to process
 */
export class TelegramAdapter implements ChannelAdapter {
	readonly channel = 'telegram';
	readonly deliveryMode = 'batched' as const;

	private readonly botApi: TelegramBotApi;

	constructor(
		botToken: string,
		private readonly credentialId: string,
		private readonly channelService: ChannelService,
		private readonly agentService: AgentService,
		private readonly sessionService: AgentSessionService,
	) {
		this.botApi = new TelegramBotApi(botToken);
	}

	/**
	 * Parse a Telegram message into an InboundMessage.
	 *
	 * The `rawBody` is a parsed TgUpdate object supplied by TelegramPoller.
	 * For callback_query (inline keyboard button press), we also handle it here.
	 * Returns null if the message was handled internally (command or unpaired user
	 * with no valid message content).
	 */
	async handleInbound(context: AdapterInboundContext): Promise<InboundMessage | null> {
		const update = context.rawBody as {
			message?: {
				message_id: number;
				from?: { id: number; username?: string; first_name?: string };
				chat: { id: number };
				text?: string;
			};
			callback_query?: {
				id: string;
				from: { id: number; username?: string };
				message?: { chat: { id: number } };
				data?: string;
			};
		};

		// Handle inline keyboard callback queries (HITL option buttons)
		if (update.callback_query) {
			const cq = update.callback_query;
			const chatId = cq.message?.chat.id;
			if (chatId && cq.data) {
				// Answer the callback to remove the loading spinner
				this.botApi.answerCallbackQuery(cq.id).catch(() => {});
				// Treat the callback data as a regular text message through the pipeline
				return this.buildInboundMessage(chatId, cq.data);
			}
			return null;
		}

		if (!update.message) return null;

		const { message } = update;
		const chatId = message.chat.id;
		const text = message.text ?? '';
		const displayName = message.from?.username
			? `@${message.from.username}`
			: (message.from?.first_name ?? String(chatId));

		// Route /commands through the universal handler
		if (text.startsWith('/')) {
			const handled = await handleChannelCommand(text, {
				channelService: this.channelService,
				agentService: this.agentService,
				sessionService: this.sessionService,
				channel: 'telegram',
				externalId: String(chatId),
				displayName,
				credentialId: this.credentialId,
				sendReply: async (replyText) => {
					await this.botApi.sendMessage(chatId, replyText).catch((err) => {
						logger.warn({ err, chatId }, '[telegram] sendReply failed');
					});
				},
			});

			if (handled) return null;
		}

		if (!text.trim()) return null;

		return this.buildInboundMessage(chatId, text);
	}

	/** Build an InboundMessage for a text payload, resolving thread context. */
	private async buildInboundMessage(chatId: number, text: string): Promise<InboundMessage | null> {
		const externalId = String(chatId);

		// Look up the channel link
		const link = await this.channelService.getLinkByExternalId('telegram', externalId);
		if (!link) {
			// Not paired — send guidance and discard
			await this.botApi
				.sendMessage(
					chatId,
					'Please pair your account first. Visit Account → Channels in the web app and generate a code, then send:\n/pair <CODE>',
				)
				.catch(() => {});
			return null;
		}

		// Resolve or auto-create the active thread (shared per_session logic)
		const { threadId, sessionExpired } = await resolveActiveThread(
			this.sessionService,
			this.channelService,
			link,
		);
		if (sessionExpired) {
			await this.botApi
				.sendMessage(chatId, '🔄 Session expired. Starting a new conversation.')
				.catch(() => {});
		}

		return {
			channel: 'telegram',
			externalId,
			userId: link.userId,
			agentId: link.agentId,
			threadId,
			content: [{ type: 'text', text }],
			notifyToolUsage: link.notifyToolUsage,
		};
	}

	/**
	 * Create a batched stream subscriber for a Telegram chat.
	 * The shared subscriber owns buffering/typing/tool-notice/flush; this adapter
	 * only supplies the Telegram send primitives.
	 */
	createStreamSubscriber(
		_threadId: string,
		externalId: string,
		options?: ChannelSubscriberOptions,
	): ChannelStreamSubscriber {
		const chatId = parseInt(externalId, 10);
		const botApi = this.botApi;

		const delivery: BatchedDelivery = {
			channel: 'telegram',
			typingRefreshMs: TYPING_REFRESH_MS,

			async sendTyping() {
				await botApi.sendChatAction(chatId, 'typing').catch(() => {});
			},

			// Long messages are split on the source text first so each chunk renders
			// as self-contained, balanced HTML (a chunk can't end mid-tag).
			async sendText(text) {
				for (const chunk of splitForTelegram(text)) {
					try {
						await botApi.sendMessage(chatId, toTelegramHtml(chunk), {
							parse_mode: 'HTML',
							disable_web_page_preview: true,
						});
					} catch (err) {
						// HTML parsing failed — fall back to plain, unformatted text
						logger.warn(
							{ err, chatId },
							'[telegram] HTML send failed — falling back to plain text',
						);
						await botApi.sendMessage(chatId, chunk).catch((fallbackErr: unknown) => {
							logger.error({ err: fallbackErr, chatId }, '[telegram] flush fallback failed');
						});
					}
				}
			},

			async sendNotice(text) {
				await botApi.sendMessage(chatId, text);
			},

			async sendHitl(prompt, hitlOptions) {
				if (hitlOptions.length > 0) {
					await botApi.sendMessage(chatId, prompt, {
						reply_markup: {
							inline_keyboard: [hitlOptions.map((o) => ({ text: o, callback_data: o }))],
						},
					});
				} else {
					await botApi.sendMessage(chatId, prompt);
				}
			},
		};

		return createBatchedSubscriber(delivery, {
			notifyToolUsage: options?.notifyToolUsage ?? false,
		});
	}

	/** Send a message to a Telegram chat (used for proactive messages). */
	async send(message: OutboundMessage): Promise<void> {
		const chatId = parseInt(message.externalId, 10);
		for (const content of message.content) {
			if (content.type === 'text') {
				await this.botApi.sendMessage(chatId, content.text).catch((err) => {
					logger.error({ err, chatId }, '[telegram] send failed');
				});
			}
		}
	}

	/** Expose the underlying botApi for use by TelegramPoller. */
	getBotApi(): TelegramBotApi {
		return this.botApi;
	}
}
