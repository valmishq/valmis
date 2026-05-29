import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

/** Credentials table — stores encrypted credential instances */
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 128 }).notNull(),
    data: text('data').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('credentials_owner_id_idx').on(table.ownerId), index('credentials_type_idx').on(table.type)],
);
