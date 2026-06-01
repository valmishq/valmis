import { pgTable, uuid, varchar, boolean, text, timestamp, index } from 'drizzle-orm/pg-core';

/** LLM provider configs table — stores encrypted API keys per provider per owner */
export const llmProviderConfigs = pgTable(
	'llm_provider_configs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id').notNull(),
		/** Provider identifier — matches LlmProvider union type */
		provider: varchar('provider', { length: 64 }).notNull(),
		/** User-defined label for this config */
		name: varchar('name', { length: 255 }).notNull(),
		/** Model identifier string, e.g. "gpt-4o" */
		model: varchar('model', { length: 255 }).notNull(),
		/** Whether this is the default config the agent uses for this owner */
		isDefault: boolean('is_default').default(false).notNull(),
		/**
		 * Whether this config is an embedding model (true) or a chat/completion model (false).
		 * Embedding models are used for vector memory; chat models are used for conversation.
		 */
		isEmbeddingModel: boolean('is_embedding_model').default(false).notNull(),
		/** Encrypted JSON payload: { apiKey, baseUrl? } */
		data: text('data').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [index('llm_configs_owner_id_idx').on(table.ownerId)],
);
