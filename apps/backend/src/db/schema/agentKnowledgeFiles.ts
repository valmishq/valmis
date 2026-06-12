import { pgTable, uuid, text, integer, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { knowledgeFiles, knowledgeFileStatusEnum } from './knowledgeFiles.js';

/**
 * Junction table — knowledge files assigned to agents. Each row carries its
 * own ingestion state because chunking + embedding runs per agent (agents use
 * different embedding models/dimensions). Memory chunks FK this row, so
 * unassigning a file (or deleting it from the library, which cascades here)
 * automatically removes that agent's chunks.
 */
export const agentKnowledgeFiles = pgTable(
	'agent_knowledge_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		agentId: uuid('agent_id')
			.notNull()
			.references(() => agents.id, { onDelete: 'cascade' }),
		knowledgeFileId: uuid('knowledge_file_id')
			.notNull()
			.references(() => knowledgeFiles.id, { onDelete: 'cascade' }),
		/** Owner of the agent — denormalized for fast ownership checks */
		ownerId: uuid('owner_id').notNull(),
		/** Per-assignment ingestion (chunk + embed) status — reuses knowledge_file_status */
		status: knowledgeFileStatusEnum('status').notNull().default('pending'),
		errorMessage: text('error_message'),
		/** Number of agent_memory chunks created by the last successful ingestion */
		chunkCount: integer('chunk_count').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		unique('agent_knowledge_files_agent_file_unique').on(table.agentId, table.knowledgeFileId),
		index('agent_knowledge_files_agent_id_idx').on(table.agentId),
		index('agent_knowledge_files_file_id_idx').on(table.knowledgeFileId),
		index('agent_knowledge_files_owner_id_idx').on(table.ownerId),
	],
);
