/**
 * TelegramBotApi — typed fetch wrapper for the Telegram Bot API.
 *
 * All methods are simple HTTPS POST/GET calls to api.telegram.org.
 * No external SDK required — the Bot API is small and well-documented.
 * Error handling: throws on non-OK HTTP responses. Callers should catch.
 */

/** Telegram User object (partial) */
export interface TgUser {
	id: number;
	is_bot: boolean;
	first_name: string;
	username?: string;
}

/** Telegram Chat object (partial) */
export interface TgChat {
	id: number;
	type: 'private' | 'group' | 'supergroup' | 'channel';
	title?: string;
	username?: string;
	first_name?: string;
}

/** Telegram Message object (partial) */
export interface TgMessage {
	message_id: number;
	from?: TgUser;
	chat: TgChat;
	date: number;
	text?: string;
	caption?: string;
	/** Present when message has a voice note */
	voice?: { file_id: string; duration: number; mime_type?: string };
	/** Present when message has a photo (array of sizes) */
	photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
	/** Present when message has a document */
	document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
	/** Present when message has a location */
	location?: { latitude: number; longitude: number };
}

/** Telegram CallbackQuery object */
export interface TgCallbackQuery {
	id: string;
	from: TgUser;
	message?: TgMessage;
	data?: string;
}

/** Telegram Update object (partial — only fields we care about) */
export interface TgUpdate {
	update_id: number;
	message?: TgMessage;
	callback_query?: TgCallbackQuery;
}

/** Inline keyboard button */
export interface TgInlineKeyboardButton {
	text: string;
	callback_data?: string;
}

/** Inline keyboard markup */
export interface TgInlineKeyboardMarkup {
	inline_keyboard: TgInlineKeyboardButton[][];
}

/** Response from getUpdates */
interface GetUpdatesResponse {
	ok: boolean;
	result: TgUpdate[];
}

/** Generic Bot API response */
interface BotApiResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
}

export class TelegramBotApi {
	private readonly baseUrl: string;

	constructor(private readonly botToken: string) {
		this.baseUrl = `https://api.telegram.org/bot${botToken}`;
	}

	/** Low-level POST call to any Bot API method */
	private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
		const res = await fetch(`${this.baseUrl}/${method}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		});

		const json = (await res.json()) as BotApiResponse<T>;

		if (!json.ok) {
			throw new Error(`Telegram API error [${method}]: ${json.description ?? 'Unknown error'}`);
		}

		return json.result as T;
	}

	/**
	 * Get pending updates using long polling.
	 * @param offset - Identifier of the first update to be returned (ack of previous)
	 * @param timeout - Seconds to wait for updates (long poll). Telegram max = 50.
	 */
	async getUpdates(offset?: number, timeout = 30): Promise<TgUpdate[]> {
		const res = await fetch(
			`${this.baseUrl}/getUpdates?` +
				new URLSearchParams({
					timeout: String(timeout),
					allowed_updates: JSON.stringify(['message', 'callback_query']),
					...(offset !== undefined ? { offset: String(offset) } : {}),
				}),
			{ signal: AbortSignal.timeout((timeout + 5) * 1000) },
		);

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Telegram getUpdates HTTP ${res.status}: ${text}`);
		}

		const json = (await res.json()) as GetUpdatesResponse;
		if (!json.ok) throw new Error('Telegram getUpdates returned ok=false');
		return json.result;
	}

	/** Send a text message. Returns the sent Message. */
	async sendMessage(
		chatId: number | string,
		text: string,
		opts?: {
			parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown';
			reply_markup?: TgInlineKeyboardMarkup;
			disable_web_page_preview?: boolean;
		},
	): Promise<TgMessage> {
		return this.call<TgMessage>('sendMessage', {
			chat_id: chatId,
			text,
			...opts,
		});
	}

	/** Send a chat action (e.g. "typing"). Expires after 5 seconds on Telegram's side. */
	async sendChatAction(
		chatId: number | string,
		action:
			| 'typing'
			| 'upload_photo'
			| 'upload_document'
			| 'record_voice'
			| 'upload_voice'
			| 'find_location',
	): Promise<void> {
		await this.call('sendChatAction', { chat_id: chatId, action });
	}

	/** Answer a callback query (removes the loading spinner on inline button presses). */
	async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
		await this.call('answerCallbackQuery', {
			callback_query_id: callbackQueryId,
			...(text ? { text } : {}),
		});
	}

	/** Verify the bot token is valid and get basic bot info. */
	async getMe(): Promise<TgUser> {
		return this.call<TgUser>('getMe');
	}

	/** Delete any registered webhook (required before starting long polling). */
	async deleteWebhook(): Promise<void> {
		await this.call('deleteWebhook', { drop_pending_updates: false });
	}

	/**
	 * Register bot commands for autocomplete (shown when user types /).
	 * scope: default — applies to all chats and users.
	 */
	async setMyCommands(commands: Array<{ command: string; description: string }>): Promise<void> {
		await this.call('setMyCommands', { commands });
	}
}
