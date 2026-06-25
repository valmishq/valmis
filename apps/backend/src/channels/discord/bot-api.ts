/**
 * DiscordBotApi — typed fetch wrapper for the Discord REST API v10.
 *
 * No external SDK. Pure HTTP calls to discord.com/api/v10.
 * All methods throw on non-OK HTTP responses. Callers should catch.
 *
 * Discord uses "Bot <token>" as the Authorization header for bot tokens.
 */

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/** Discord User object (partial) */
export interface DiscordUser {
	id: string;
	username: string;
	discriminator: string;
	global_name?: string;
	bot?: boolean;
}

/** Discord Channel object (partial) */
export interface DiscordChannel {
	id: string;
	type: number;
	/** For DM channels — the recipient user */
	recipients?: DiscordUser[];
}

/** Discord Message object (partial) */
export interface DiscordMessage {
	id: string;
	channel_id: string;
	author: DiscordUser;
	content: string;
	timestamp: string;
	/** Components attached to this message (buttons, etc.) */
	components?: DiscordMessageComponent[];
}

/** A single action row component */
export interface DiscordMessageComponent {
	type: number;
	components?: DiscordButtonComponent[];
}

/** A button component */
export interface DiscordButtonComponent {
	type: number;
	style: number;
	label: string;
	custom_id?: string;
}

/** A slash command option value */
export interface DiscordInteractionOption {
	name: string;
	type: number;
	value?: string | number | boolean;
}

/**
 * Discord Interaction object (partial).
 * type 2 = APPLICATION_COMMAND (slash command)
 * type 3 = MESSAGE_COMPONENT (button click)
 */
export interface DiscordInteraction {
	id: string;
	type: number;
	token: string;
	/** The user who triggered the interaction */
	user?: DiscordUser;
	member?: { user: DiscordUser };
	/** The message the interaction occurred on */
	message?: DiscordMessage;
	/**
	 * Interaction data.
	 * - custom_id / component_type: present for MESSAGE_COMPONENT (type 3)
	 * - name / options: present for APPLICATION_COMMAND (type 2)
	 */
	data?: {
		/** Slash command name (APPLICATION_COMMAND interactions) */
		name?: string;
		/** Slash command options/arguments (APPLICATION_COMMAND interactions) */
		options?: DiscordInteractionOption[];
		/** Button custom_id (MESSAGE_COMPONENT interactions) */
		custom_id?: string;
		component_type?: number;
	};
	channel_id?: string;
}

/** Discord Gateway event for MESSAGE_CREATE (partial) */
export interface DiscordMessageCreateEvent {
	id: string;
	channel_id: string;
	author: DiscordUser;
	content: string;
	timestamp: string;
	/** Present for guild messages */
	guild_id?: string;
	/** Message mentions the bot — used to detect @mentions */
	mentions?: DiscordUser[];
	/** File attachments — each carries a public CDN url to download from. */
	attachments?: Array<{
		id: string;
		filename: string;
		url: string;
		content_type?: string;
		size: number;
	}>;
	/** Channel type: 1 = DM, 0 = guild text */
	type: number;
}

/** Options for sendMessage */
export interface SendMessageOptions {
	content?: string;
	/** Rich embed objects */
	embeds?: DiscordEmbed[];
	/** Message components (action rows with buttons) */
	components?: DiscordMessageComponent[];
	/** File attachments — uploaded via multipart. Images render inline automatically. */
	files?: Array<{ name: string; data: Buffer }>;
}

/** Simple embed structure */
export interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export class DiscordBotApi {
	private readonly headers: Record<string, string>;

	constructor(private readonly botToken: string) {
		this.headers = {
			Authorization: `Bot ${botToken}`,
			'Content-Type': 'application/json',
		};
	}

	/** Low-level REST call */
	private async call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
		const res = await fetch(`${DISCORD_API_BASE}${path}`, {
			method,
			headers: this.headers,
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Discord API error [${method} ${path}]: ${res.status} ${text}`);
		}

		// 204 No Content — return empty object
		if (res.status === 204) return {} as T;

		return res.json() as Promise<T>;
	}

	/**
	 * Get the current bot user information.
	 * Used for credential verification.
	 */
	async getMe(): Promise<DiscordUser> {
		return this.call<DiscordUser>('GET', '/users/@me');
	}

	/**
	 * Get the recommended Gateway URL for this bot.
	 * Returns wss:// endpoint with shard recommendations.
	 */
	async getGatewayBot(): Promise<{ url: string; shards: number }> {
		return this.call<{ url: string; shards: number }>('GET', '/gateway/bot');
	}

	/**
	 * Create a DM channel with a user.
	 * Discord requires opening a DM channel before sending a DM.
	 * Subsequent calls with the same recipient_id return the same channel.
	 */
	async createDM(recipientId: string): Promise<DiscordChannel> {
		return this.call<DiscordChannel>('POST', '/users/@me/channels', {
			recipient_id: recipientId,
		});
	}

	/**
	 * Send a message to a channel.
	 * For DMs: channel must be the DM channel ID (from createDM).
	 * Message text is sent as standard Markdown — Discord renders it natively.
	 */
	async sendMessage(channelId: string, options: SendMessageOptions): Promise<DiscordMessage> {
		const payload = {
			...(options.content !== undefined ? { content: options.content } : {}),
			...(options.embeds ? { embeds: options.embeds } : {}),
			...(options.components ? { components: options.components } : {}),
		};

		// With attachments, Discord requires multipart/form-data: a payload_json part
		// plus files[n]. Without, use the normal JSON path. Don't set Content-Type on
		// the multipart request — fetch adds the boundary.
		if (options.files && options.files.length > 0) {
			const form = new FormData();
			form.append('payload_json', JSON.stringify(payload));
			options.files.forEach((f, i) => {
				form.append(`files[${i}]`, new Blob([new Uint8Array(f.data)]), f.name);
			});
			const res = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
				method: 'POST',
				headers: { Authorization: `Bot ${this.botToken}` },
				body: form,
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(`Discord API error [POST messages w/ files]: ${res.status} ${text}`);
			}
			return res.json() as Promise<DiscordMessage>;
		}

		return this.call<DiscordMessage>('POST', `/channels/${channelId}/messages`, payload);
	}

	/**
	 * Trigger the typing indicator in a channel.
	 * Expires after approximately 10 seconds on Discord's side.
	 */
	async sendTyping(channelId: string): Promise<void> {
		await this.call<Record<string, never>>('POST', `/channels/${channelId}/typing`);
	}

	/**
	 * Register global application (slash) commands for this bot.
	 * Commands appear in the autocomplete UI when a user types / in any DM.
	 *
	 * This is a PUT (bulk overwrite) — it replaces all existing global commands.
	 * Propagation to Discord clients can take up to 1 hour for global commands.
	 *
	 * @param applicationId - The bot's application/client ID (from getMe().id)
	 * @param commands - Array of command definitions; options become Discord STRING parameters
	 */
	async bulkOverwriteGlobalCommands(
		applicationId: string,
		commands: Array<{
			name: string;
			description: string;
			type?: number;
			options?: Array<{ name: string; description: string; required: boolean }>;
		}>,
	): Promise<void> {
		// Use a direct PUT — the call() helper defaults to POST
		const res = await fetch(`${DISCORD_API_BASE}/applications/${applicationId}/commands`, {
			method: 'PUT',
			headers: this.headers,
			body: JSON.stringify(
				commands.map((cmd) => ({
					type: cmd.type ?? 1, // 1 = CHAT_INPUT (slash command)
					name: cmd.name,
					description: cmd.description,
					// Map options as Discord STRING options (type 3)
					...(cmd.options && cmd.options.length > 0
						? {
								options: cmd.options.map((opt) => ({
									type: 3, // STRING
									name: opt.name,
									description: opt.description,
									required: opt.required,
								})),
							}
						: {}),
				})),
			),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Discord bulkOverwriteGlobalCommands error: ${res.status} ${text}`);
		}
	}

	/**
	 * Respond to an interaction (e.g. a button click or slash command).
	 * Interaction responses must be sent within 3 seconds or Discord shows
	 * "The application did not respond".
	 *
	 * Common types:
	 *   type 4 = CHANNEL_MESSAGE_WITH_SOURCE  — immediate visible reply
	 *   type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE — "thinking" state (slash commands)
	 *   type 6 = DEFERRED_UPDATE_MESSAGE — acknowledge button click silently
	 */
	async createInteractionResponse(
		interactionId: string,
		interactionToken: string,
		data: { type: number; data?: { content?: string; flags?: number } },
	): Promise<void> {
		const res = await fetch(
			`${DISCORD_API_BASE}/interactions/${interactionId}/${interactionToken}/callback`,
			{
				method: 'POST',
				headers: this.headers,
				body: JSON.stringify(data),
			},
		);

		if (!res.ok && res.status !== 204) {
			const text = await res.text();
			throw new Error(`Discord interaction response error: ${res.status} ${text}`);
		}
	}

	/**
	 * Edit the original deferred interaction response (follow-up after type 5 defer).
	 * Must be called after createInteractionResponse with type 5 to send actual content.
	 * Can be called up to 15 minutes after the original interaction.
	 */
	async editOriginalInteractionResponse(
		applicationId: string,
		interactionToken: string,
		content: string,
	): Promise<void> {
		const res = await fetch(
			`${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
			{
				method: 'PATCH',
				headers: this.headers,
				body: JSON.stringify({ content }),
			},
		);

		if (!res.ok && res.status !== 204) {
			const text = await res.text();
			throw new Error(`Discord editOriginalInteractionResponse error: ${res.status} ${text}`);
		}
	}
}
