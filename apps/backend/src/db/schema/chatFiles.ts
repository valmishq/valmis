import { pgTable, pgEnum, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { agentThreads } from './agentThreads.js';
import { agentMessages } from './agentMessages.js';

/** Who produced a chat file: a user upload, or a file the agent shared back. */
export const chatFileSourceEnum = pgEnum('chat_file_source', ['user_upload', 'agent_output']);

/** Coarse kind used by the UI to decide inline-image vs. document chip rendering. */
export const chatFileKindEnum = pgEnum('chat_file_kind', ['image', 'document']);

/**
 * Text-extraction lifecycle for document uploads. Images and agent outputs are
 * created as 'skipped' (no extraction). 'skipped' also covers documents whose
 * extraction yielded no text (e.g. scanned PDFs) — the raw file is still
 * materialized into the workspace so the agent can parse it with run_code.
 */
export const chatFileExtractionStatusEnum = pgEnum('chat_file_extraction_status', [
	'pending',
	'processing',
	'ready',
	'error',
	'skipped',
]);

/**
 * Files attached to a chat thread — both user uploads and files the agent shares
 * back to the user. Unlike knowledge_files, the RAW BYTES ARE PERSISTED on the
 * backend-owned host volume (CHAT_FILES_PATH) so the backend can serve them to
 * the browser and copy them into the agent workspace at spawn time. The DB row
 * only holds metadata + the relative storage key.
 */
export const chatFiles = pgTable(
	'chat_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		threadId: uuid('thread_id')
			.notNull()
			.references(() => agentThreads.id, { onDelete: 'cascade' }),
		/**
		 * The message this file is rendered under. Null until linked: user uploads
		 * are linked to the user message once it is persisted; agent outputs are
		 * linked to the most recent message at share time.
		 */
		messageId: uuid('message_id').references(() => agentMessages.id, { onDelete: 'set null' }),
		source: chatFileSourceEnum('source').notNull(),
		kind: chatFileKindEnum('kind').notNull(),
		/** Display file name (original upload name or agent-provided name). */
		name: text('name').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		/** Path relative to CHAT_FILES_PATH, e.g. "<ownerId>/<fileId>". */
		storageKey: text('storage_key').notNull(),
		/** Document text-extraction status (see enum). */
		extractionStatus: chatFileExtractionStatusEnum('extraction_status').notNull().default('pending'),
		errorMessage: text('error_message'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	(table) => [
		index('chat_files_thread_id_idx').on(table.threadId),
		index('chat_files_owner_id_idx').on(table.ownerId),
		index('chat_files_message_id_idx').on(table.messageId),
	],
);
