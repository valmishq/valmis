import {
	pgTable,
	pgEnum,
	uuid,
	text,
	boolean,
	integer,
	timestamp,
	index,
	unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { agents } from './agents.js';
import { agentThreads } from './agentThreads.js';
import { credentials } from './credentials.js';

/**
 * Thread session mode enum.
 * 'persistent'  — all messages resume the same thread until the user switches.
 * 'per_session' — auto-create a new thread after sessionTimeoutMin of inactivity.
 * This is an enum because the values are closed/fixed and won't change.
 */
export const channelThreadModeEnum = pgEnum('channel_thread_mode', ['persistent', 'per_session']);

/**
 * A verified pairing between a platform identity (e.g. Telegram chat_id)
 * and an internal user account + agent.
 *
 * channel is plain text — no pgEnum — so adding new channel adapters only
 * requires code changes, not a DB migration to alter the enum type.
 *
 * Unique constraint: (channel, external_id) — one platform identity maps to
 * exactly one account.
 */
export const channelLinks = pgTable(
	'channel_links',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** The platform user account this link belongs to */
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/**
		 * Platform type string: 'telegram' | 'whatsapp' | 'discord' | etc.
		 * Stored as plain text to allow adding new channels without migrations.
		 */
		channel: text('channel').notNull(),
		/**
		 * Platform-specific sender ID.
		 * Telegram: chat_id (as string), WhatsApp: phone number, Discord: user snowflake.
		 */
		externalId: text('external_id').notNull(),
		/** Currently active agent — required at pairing time */
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/**
		 * Currently active thread for this link.
		 * Null until the first message is sent through the channel.
		 * Updated on /new command or per_session auto-expire.
		 */
		activeThreadId: uuid('active_thread_id').references(() => agentThreads.id, {
			onDelete: 'set null',
		}),
		/** Thread session mode — enum since values are fixed */
		threadMode: channelThreadModeEnum('thread_mode').notNull().default('persistent'),
		/** Inactivity timeout in minutes — only used when threadMode = 'per_session' */
		sessionTimeoutMin: integer('session_timeout_min').notNull().default(60),
		/**
		 * When true, the bot sends "🔧 Using {toolName}..." notifications while the
		 * agent is running a tool during a turn.
		 */
		notifyToolUsage: boolean('notify_tool_usage').notNull().default(false),
		/** Platform username or display name — for UI display only */
		displayName: text('display_name'),
		/**
		 * The credential that holds the bot token for this channel.
		 * Null for the web channel (no credential needed).
		 * For Telegram, WhatsApp, etc.: references the user's bot credential.
		 */
		credentialId: uuid('credential_id').references(() => credentials.id, {
			onDelete: 'set null',
		}),
		/** Set to true once the pairing code is successfully consumed */
		isVerified: boolean('is_verified').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		/** One platform identity per account — prevents pairing the same bot chat to two users */
		unique('channel_links_channel_external_id_unique').on(table.channel, table.externalId),
		index('channel_links_user_id_idx').on(table.userId),
		index('channel_links_agent_id_idx').on(table.agentId),
	],
);
