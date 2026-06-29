import {
	pgTable,
	uuid,
	varchar,
	text,
	timestamp,
	index,
	integer,
	boolean,
} from 'drizzle-orm/pg-core';
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
		/**
		 * Whether the agent's sandboxed runtime may reach the public internet.
		 * Enforced by the docker execution driver via network selection —
		 * credential-proxied call_api requests are unaffected.
		 */
		allowInternetAccess: boolean('allow_internet_access').notNull().default(true),
		/**
		 * When true, the agent has access to ALL of the owner's credentials —
		 * current and any added later — instead of the explicit set in the
		 * agent_credentials junction. Resolved at spawn time, so newly added
		 * credentials are picked up automatically. Default false.
		 */
		allCredentials: boolean('all_credentials').notNull().default(false),
		/**
		 * Maximum number of tool calls the agent may make in a single chat turn.
		 * Enforced by agent-runner.ts (interactive chat) — when exceeded the agent
		 * is blocked from further tools and forced to give a final reply. Workflow
		 * steps use their own per-step cap and ignore this value. Default 20.
		 */
		maxToolCallsPerTurn: integer('max_tool_calls_per_turn').notNull().default(20),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [index('agents_owner_id_idx').on(table.ownerId)],
);
