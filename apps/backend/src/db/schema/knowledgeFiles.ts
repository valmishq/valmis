import { pgTable, pgEnum, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import type { ExtractedSegment } from '@repo/types';
import { users } from './users.js';
import { credentials } from './credentials.js';

/** Where a knowledge file came from */
export const knowledgeSourceTypeEnum = pgEnum('knowledge_source_type', ['upload', 'cloud']);

/**
 * Shared lifecycle status enum. On knowledge_files it tracks text extraction;
 * on agent_knowledge_files it tracks per-agent chunking + embedding.
 */
export const knowledgeFileStatusEnum = pgEnum('knowledge_file_status', [
	'pending',
	'processing',
	'ready',
	'error',
]);

/**
 * User-level knowledge library. Raw file bytes are NEVER persisted — only the
 * extracted text segments (with source locations) are stored, which is enough
 * to re-chunk/re-embed for any agent without the original file.
 */
export const knowledgeFiles = pgTable(
	'knowledge_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Display file name (after any cloud export conversion, e.g. ".docx" suffix) */
		name: text('name').notNull(),
		sourceType: knowledgeSourceTypeEnum('source_type').notNull(),
		/** Cloud provider id (e.g. 'google-drive') — null for uploads */
		provider: text('provider'),
		/** Credential used for cloud import — survives as null after credential deletion */
		credentialId: uuid('credential_id').references(() => credentials.id, {
			onDelete: 'set null',
		}),
		/** Provider-specific file identifier (Drive file id, Dropbox path_lower, Graph item id) */
		externalId: text('external_id'),
		/** Human-readable provider path where available */
		externalPath: text('external_path'),
		mimeType: text('mime_type'),
		sizeBytes: integer('size_bytes'),
		/** Library-level text extraction status */
		status: knowledgeFileStatusEnum('status').notNull().default('pending'),
		errorMessage: text('error_message'),
		/**
		 * ExtractedSegment[] from @repo/extractor — the single source of truth
		 * for ingestion. Capped in the service layer to bound row size.
		 */
		extractedSegments: jsonb('extracted_segments').$type<ExtractedSegment[]>(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		index('knowledge_files_owner_id_idx').on(table.ownerId),
		index('knowledge_files_status_idx').on(table.status),
	],
);
