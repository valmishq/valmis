import { pgTable, uuid, varchar, text, timestamp, index, integer } from 'drizzle-orm/pg-core';
import { llmProviderConfigs } from './llmProviderConfigs.js';

/** Agents table — stores agent configuration and identity */
export const agents = pgTable(
	'agents',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id').notNull(),
		name: varchar('name', { length: 255 }).notNull(),
		description: text('description'),
		systemInstruction: text('system_instruction'),
		/** Emoji character (default) or image URL */
		avatarUrl: text('avatar_url'),
		/**
		 * LLM provider config used for chat/completion at runtime.
		 * Null means no model has been selected yet.
		 */
		modelConfigId: uuid('model_config_id').references(() => llmProviderConfigs.id, {
			onDelete: 'set null',
		}),
		/**
		 * LLM provider config used for generating memory embeddings.
		 * Null means no embedding model has been selected yet.
		 */
		embeddingModelConfigId: uuid('embedding_model_config_id').references(
			() => llmProviderConfigs.id,
			{ onDelete: 'set null' },
		),
		/**
		 * Dimension of the embedding vectors stored in agent_memory.
		 * Must match the output dimension of the selected embedding model.
		 * Stored here to allow per-agent flexibility and to validate queries.
		 */
		embeddingDim: integer('embedding_dim'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [index('agents_owner_id_idx').on(table.ownerId)],
);
