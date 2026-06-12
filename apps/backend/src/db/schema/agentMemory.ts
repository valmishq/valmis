import { pgTable, uuid, text, timestamp, index, jsonb, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { agentThreads } from './agentThreads.js';
import { agentKnowledgeFiles } from './agentKnowledgeFiles.js';

/**
 * Memory type classification — mirrors the four-layer memory model.
 *
 * - episodic:   Raw records of what happened (conversation logs, task outcomes)
 * - semantic:   Distilled facts and long-term knowledge about users/domain
 * - procedural: Behavioral rules, patterns, and operating constraints the agent learned
 * - working:    Short-lived context scoped to the current thread (ephemeral knowledge)
 */
export const memoryTypeEnum = pgEnum('memory_type', [
	'episodic',
	'semantic',
	'procedural',
	'working',
]);

export type MemoryTypeEnum = (typeof memoryTypeEnum.enumValues)[number];

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
		/**
		 * Optional thread scope — set for 'working' memory entries.
		 * Null means the entry is global to the agent (not scoped to a thread).
		 */
		threadId: uuid('thread_id').references(() => agentThreads.id, { onDelete: 'cascade' }),
		/**
		 * Memory classification — used to filter retrieval by type.
		 * Default is 'semantic' (the most common long-term memory type).
		 */
		memoryType: memoryTypeEnum('memory_type').notNull().default('semantic'),
		/** Raw text content of the memory entry */
		content: text('content').notNull(),
		/**
		 * Vector embedding for similarity search.
		 * Dimension must match the agent's embeddingDim field.
		 * Changing the agent's embedding model requires clearing existing memory entries.
		 */
		embedding: vector('embedding').notNull(),
		/** Optional metadata (source, tags, confidence, etc.) */
		metadata: jsonb('metadata'),
		/**
		 * True for chunks generated from a knowledge-base file. Knowledge chunks
		 * are excluded from the memory management UI by default but remain fully
		 * searchable via memory_search.
		 */
		isKnowledgeBase: boolean('is_knowledge_base').notNull().default(false),
		/**
		 * Owning knowledge assignment (agent_knowledge_files row). Unassigning a
		 * file from the agent — or deleting it from the library — cascades and
		 * removes the chunks automatically.
		 */
		agentKnowledgeFileId: uuid('agent_knowledge_file_id').references(() => agentKnowledgeFiles.id, {
			onDelete: 'cascade',
		}),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		/** B-tree index for filtering by agent */
		index('agent_memory_agent_id_idx').on(table.agentId),
		/** B-tree index for filtering by memory type */
		index('agent_memory_type_idx').on(table.memoryType),
		/** B-tree index for thread-scoped working memory queries */
		index('agent_memory_thread_id_idx').on(table.threadId),
		/** B-tree index for per-assignment chunk deletion (reprocess path) */
		index('agent_memory_agent_knowledge_file_id_idx').on(table.agentKnowledgeFileId),
		// HNSW index is intentionally omitted — pgvector requires a fixed-dimension column
		// (e.g. vector(1536)) to build an HNSW index, but this system supports multiple
		// embedding models with different output dimensions. Exact cosine search via
		// `ORDER BY embedding <=> $query LIMIT k` is used instead.
	],
);
