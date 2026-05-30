import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { CaslPolicy } from '@repo/types';

/** Roles table — stores RBAC roles with their CASL policy arrays */
export const roles = pgTable('roles', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	/** Stable machine identifier, e.g. 'predefined_super_admin' */
	slug: text('slug').unique(),
	/** Array of CaslPolicy objects stored as JSONB */
	policies: jsonb('policies').$type<CaslPolicy[]>().notNull().default([]),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
