import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

/** Users table — stores application user accounts */
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	first_name: text('first_name'),
	last_name: text('last_name'),
	/** bcrypt hash; null for OAuth-only users */
	password: text('password'),
	/** Authentication provider: 'local' | 'google' | etc. */
	provider: text('provider').default('local').notNull(),
	/** OAuth subject ID for third-party providers */
	provider_id: text('provider_id'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
