import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** api_keys table — stores encrypted API keys for users */
export const apiKeys = pgTable(
	'api_keys',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** AES-256-GCM encrypted full key (blob layout: salt|iv|authTag|ciphertext, hex-encoded) */
		key: text('key').notNull(),
		/** SHA-256 hash of the raw key — used for fast constant-time lookup */
		keyHash: text('key_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		index('api_keys_user_id_idx').on(table.userId),
		index('api_keys_key_hash_idx').on(table.keyHash),
	],
);
