import { logger } from '../../config/logger.js';
import { CHANNEL_COMMANDS } from '../commands.js';
import type { TelegramBotApi, TgUpdate } from './bot-api.js';
import type { TelegramAdapter } from './adapter.js';
import type { MessagePipeline } from '../pipeline.js';

/** Minimum delay between retries in ms */
const BACKOFF_MIN_MS = 2000;
/** Maximum delay between retries in ms */
const BACKOFF_MAX_MS = 30000;

/**
 * TelegramPoller — long-polling loop for a single Telegram bot token.
 *
 * One TelegramPoller runs per unique bot credential. It:
 *   1. Calls getUpdates with a 30-second timeout (long poll)
 *   2. For each Update, calls adapter.handleInbound() to parse it
 *   3. If handleInbound() returns an InboundMessage, passes it to MessagePipeline.process()
 *   4. Advances the offset so Telegram doesn't re-deliver processed updates
 *   5. On any error, retries with exponential backoff (2s → 4s → 8s → ... → 30s)
 *
 * Calling stop() signals the loop to exit after the current getUpdates call resolves.
 */
export class TelegramPoller {
	private running = false;
	private offset: number | undefined = undefined;
	private backoffMs = BACKOFF_MIN_MS;

	constructor(
		private readonly botApi: TelegramBotApi,
		private readonly adapter: TelegramAdapter,
		private readonly pipeline: MessagePipeline,
		/** credentialId — used only for logging context */
		private readonly credentialId: string,
	) {}

	/**
	 * Start the polling loop (non-blocking — runs in the background).
	 * Calling start() when already running is a no-op.
	 */
	start(): void {
		if (this.running) return;
		this.running = true;

		// Delete any registered webhook so Telegram switches to polling mode,
		// then register bot commands for autocomplete, then start polling.
		this.botApi
			.deleteWebhook()
			.then(async () => {
				logger.info(
					{ credentialId: this.credentialId },
					'[telegram-poller] webhook cleared, registering commands',
				);
				// Register commands for / autocomplete in the Telegram UI
				await this.botApi.setMyCommands(CHANNEL_COMMANDS).catch((err: unknown) => {
					logger.warn(
						{ err, credentialId: this.credentialId },
						'[telegram-poller] setMyCommands failed (non-fatal)',
					);
				});
				logger.info(
					{ credentialId: this.credentialId },
					'[telegram-poller] commands registered, polling started',
				);
				void this.loop();
			})
			.catch((err: unknown) => {
				logger.warn(
					{ err, credentialId: this.credentialId },
					'[telegram-poller] deleteWebhook failed — polling anyway',
				);
				void this.loop();
			});
	}

	/** Signal the polling loop to stop after the current poll resolves. */
	stop(): void {
		this.running = false;
		logger.info({ credentialId: this.credentialId }, '[telegram-poller] stop requested');
	}

	/** The main polling loop — runs until stop() is called. */
	private async loop(): Promise<void> {
		while (this.running) {
			try {
				const updates = await this.botApi.getUpdates(this.offset, 30);

				if (updates.length > 0) {
					// Process updates sequentially to preserve message order per chat
					for (const update of updates) {
						await this.processUpdate(update);
					}
					// Advance offset past the last processed update
					this.offset = updates[updates.length - 1].update_id + 1;
					// Reset backoff on success
					this.backoffMs = BACKOFF_MIN_MS;
				}
			} catch (err: unknown) {
				if (!this.running) break; // Stop was requested while we were polling

				logger.warn(
					{ err, credentialId: this.credentialId, backoffMs: this.backoffMs },
					'[telegram-poller] getUpdates error — retrying',
				);

				// Exponential backoff
				await sleep(this.backoffMs);
				this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
			}
		}

		logger.info({ credentialId: this.credentialId }, '[telegram-poller] loop exited');
	}

	/** Process a single Telegram update through the adapter and pipeline. */
	private async processUpdate(update: TgUpdate): Promise<void> {
		try {
			const inbound = await this.adapter.handleInbound({
				rawBody: update,
				headers: {},
				params: {},
				query: {},
			});

			if (!inbound) return; // Command handled internally or message discarded

			// Pass this poller's own adapter so the response is delivered through
			// the same bot token that received the message (multi-bot safety).
			const result = await this.pipeline.process(inbound, this.adapter);

			if (!result.ok) {
				// 409 = agent is busy — send a user-friendly message
				if (result.status === 409) {
					const chatId = parseInt(inbound.externalId, 10);
					this.adapter
						.send({
							channel: 'telegram',
							externalId: inbound.externalId,
							content: [
								{
									type: 'text',
									text: '⏳ Still working on your previous message. Please wait.',
								},
							],
						})
						.catch(() => {});
					logger.debug({ chatId }, '[telegram-poller] agent busy (409) — notified user');
				} else {
					logger.error(
						{ status: result.status, error: result.error, credentialId: this.credentialId },
						'[telegram-poller] pipeline error',
					);
				}
			}
		} catch (err: unknown) {
			logger.error(
				{ err, updateId: update.update_id, credentialId: this.credentialId },
				'[telegram-poller] update processing failed',
			);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
