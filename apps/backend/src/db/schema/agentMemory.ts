import { pgTable, uuid, text, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/**
 * Custom pgvector column type for Drizzle ORM — variable-length vector.
 * No fixed dimension here; each agent stores its own embeddingDim on the agents table.
 * pgvector supports variable-length vectors when no dimension is specified.
 */
const vector = customType<{ data: number[]; driverData: string }>({
	dataType() {
		return 'vector';
	},
	fromDriver(value: string): number[] {
		// Postgres returns vectors as "[0.1,0.2,...]"
		return value
			.replace(/[\[\]]/g, '')
			.split(',')
			.map(Number);
	},
	toDriver(value: number[]): string {
		return `[${value.join(',')}]`;
	},
});

/** Agent memory table — stores vector embeddings for semantic search */
export const agentMemory = pgTable(
	'agent_memory',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		/** Raw text content of the memory entry */
		content: text('content').notNull(),
		/**
		 * Vector embedding for similarity search.
		 * Dimension must match the agent's embeddingDim field.
		 * Changing the agent's embedding model requires clearing existing memory entries.
		 */
		embedding: vector('embedding').notNull(),
		/** Optional metadata (source, tags, etc.) */
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		/** B-tree index for filtering by agent */
		index('agent_memory_agent_id_idx').on(table.agentId),
		// HNSW index is intentionally omitted — pgvector requires a fixed-dimension column
		// (e.g. vector(1536)) to build an HNSW index, but this system supports multiple
		// embedding models with different output dimensions. Exact cosine search via
		// `ORDER BY embedding <=> $query LIMIT k` is used instead.
	],
);
