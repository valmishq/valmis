import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { agents } from './agents.js';
import { credentials } from './credentials.js';

/**
 * One-time pairing codes generated from the Web UI.
 * The user sends the code to the external platform bot to link their account.
 *
 * Security:
 *   - 6-character alphanumeric code (~2.2 billion combinations)
 *   - 10-minute TTL (expiresAt)
 *   - Single-use (consumedAt set once used, subsequent attempts rejected)
 *   - channel stored so the bot can validate it's receiving the code on the correct platform
 */
export const channelPairingCodes = pgTable(
	'channel_pairing_codes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** User account that generated this code */
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** 6-character alphanumeric code shown to the user */
		code: text('code').notNull(),
		/**
		 * Which channel this code is for.
		 * Plain text — matches channelLinks.channel — no migration needed for new channels.
		 */
		channel: text('channel').notNull(),
		/** Agent to bind on successful pairing */
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/**
		 * The bot credential to use for this channel pairing.
		 * Null for web; required for Telegram, WhatsApp, etc.
		 * Passed through to channel_links when the code is consumed.
		 */
		credentialId: uuid('credential_id').references(() => credentials.id, {
			onDelete: 'cascade',
		}),
		/** When this code expires — 10-minute TTL from creation */
		expiresAt: timestamp('expires_at').notNull(),
		/** Set when the code is consumed — null means not yet used */
		consumedAt: timestamp('consumed_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		index('channel_pairing_codes_user_id_idx').on(table.userId),
		/** Fast lookup by code + channel during pairing validation */
		index('channel_pairing_codes_code_channel_idx').on(table.code, table.channel),
	],
);
