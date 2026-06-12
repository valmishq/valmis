import { and, eq, inArray, sql } from 'drizzle-orm';
import { extractText, chunkSegments } from '@repo/extractor';
import type {
	AgentKnowledgeAssignment,
	ExtractedSegment,
	KnowledgeFile,
	KnowledgeImportRequestBody,
} from '@repo/types';
import { db } from '../db/index.js';
import { agentKnowledgeFiles, knowledgeFiles } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import type { AgentService } from './AgentService.js';
import type { AgentMemoryService } from './AgentMemoryService.js';
import type { CredentialService } from './CredentialService.js';
import type { CloudProviderRegistry } from './knowledge/providerRegistry.js';

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Max original file size accepted for upload/import */
export const MAX_KNOWLEDGE_FILE_BYTES = 20 * 1024 * 1024;
/** Max files per cloud-import request */
export const MAX_IMPORT_FILES_PER_REQUEST = 20;
/** Cap on stored extracted text per file (characters across all segments) */
const MAX_STORED_TEXT_CHARS = 5 * 1024 * 1024;
/** Texts per embedMany call — bounds provider payload size */
const EMBED_BATCH_SIZE = 32;

/** File extensions accepted by the unified extractor */
export const ALLOWED_KNOWLEDGE_EXTENSIONS = [
	'pdf',
	'docx',
	'xlsx',
	'pptx',
	'txt',
	'md',
	'markdown',
	'csv',
	'json',
	'html',
	'htm',
] as const;

/** Google-native mimes allowed on cloud import only — exported to OOXML before extraction */
const GOOGLE_NATIVE_IMPORTABLE_MIMES = new Set([
	'application/vnd.google-apps.document',
	'application/vnd.google-apps.spreadsheet',
	'application/vnd.google-apps.presentation',
]);

function hasAllowedExtension(fileName: string): boolean {
	const idx = fileName.lastIndexOf('.');
	if (idx === -1) return false;
	const ext = fileName.slice(idx + 1).toLowerCase();
	return (ALLOWED_KNOWLEDGE_EXTENSIONS as readonly string[]).includes(ext);
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface KnowledgeUploadInput {
	name: string;
	mimeType?: string;
	sizeBytes: number;
	data: Buffer;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToKnowledgeFile(row: typeof knowledgeFiles.$inferSelect): KnowledgeFile {
	return {
		id: row.id,
		ownerId: row.ownerId,
		name: row.name,
		sourceType: row.sourceType,
		provider: row.provider ?? undefined,
		credentialId: row.credentialId ?? undefined,
		externalId: row.externalId ?? undefined,
		externalPath: row.externalPath ?? undefined,
		mimeType: row.mimeType ?? undefined,
		sizeBytes: row.sizeBytes ?? undefined,
		status: row.status,
		errorMessage: row.errorMessage ?? undefined,
		hasExtractedText: row.extractedSegments !== null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function rowToAssignment(
	row: typeof agentKnowledgeFiles.$inferSelect,
	file: typeof knowledgeFiles.$inferSelect,
): AgentKnowledgeAssignment {
	return {
		id: row.id,
		agentId: row.agentId,
		knowledgeFileId: row.knowledgeFileId,
		status: row.status,
		errorMessage: row.errorMessage ?? undefined,
		chunkCount: row.chunkCount,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		file: {
			name: file.name,
			sourceType: file.sourceType,
			provider: file.provider ?? undefined,
			mimeType: file.mimeType ?? undefined,
			sizeBytes: file.sizeBytes ?? undefined,
			status: file.status,
		},
	};
}

function truncateError(err: unknown): string {
	const MAX_ERROR_CHARS = 500;
	const message = err instanceof Error ? err.message : String(err);
	return message.slice(0, MAX_ERROR_CHARS);
}

/**
 * Knowledge-base service — owns the user-level knowledge library and the
 * per-agent assignments.
 *
 * Two-phase pipeline:
 *   1. Library extraction (once per file): upload/cloud-download → extractText
 *      → store ExtractedSegment[] on the row. Raw bytes are never persisted.
 *   2. Assignment ingestion (per agent): chunkSegments → embed with the
 *      agent's embedding model → agent_memory rows flagged isKnowledgeBase
 *      with an FK to the assignment (cascade on unassign/file delete).
 *
 * Both phases run as sequential fire-and-forget background tasks (the house
 * pattern — no job queue); row status doubles as the re-entrancy guard.
 */
export class KnowledgeBaseService {
	constructor(
		private readonly agentService: AgentService,
		private readonly memoryService: AgentMemoryService,
		private readonly providerRegistry: CloudProviderRegistry,
		private readonly credentialService: CredentialService,
	) {}

	// ─── Library ───────────────────────────────────────────────────────────────

	async listFiles(ownerId: string): Promise<KnowledgeFile[]> {
		const rows = await db
			.select()
			.from(knowledgeFiles)
			.where(eq(knowledgeFiles.ownerId, ownerId))
			.orderBy(sql`${knowledgeFiles.createdAt} DESC`);
		return rows.map(rowToKnowledgeFile);
	}

	/**
	 * Create library rows for uploaded files and start extraction in the
	 * background. Returns the created rows immediately (status 'pending').
	 * Throws on validation failure (file type / size) before anything is stored.
	 */
	async createFromUploads(
		ownerId: string,
		uploads: KnowledgeUploadInput[],
	): Promise<KnowledgeFile[]> {
		for (const upload of uploads) {
			if (!hasAllowedExtension(upload.name)) {
				throw new Error(
					`Unsupported file type: ${upload.name}. Allowed: ${ALLOWED_KNOWLEDGE_EXTENSIONS.join(', ')}.`,
				);
			}
			if (upload.sizeBytes > MAX_KNOWLEDGE_FILE_BYTES) {
				throw new Error(
					`File too large: ${upload.name}. Maximum size is ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)}MB.`,
				);
			}
		}

		const rows = await db
			.insert(knowledgeFiles)
			.values(
				uploads.map((upload) => ({
					ownerId,
					name: upload.name,
					sourceType: 'upload' as const,
					mimeType: upload.mimeType ?? null,
					sizeBytes: upload.sizeBytes,
				})),
			)
			.returning();

		// Sequential background extraction — bounds memory and embedding pressure
		void (async () => {
			for (let i = 0; i < rows.length; i++) {
				await this.extractAndStore(rows[i].id, uploads[i].data, rows[i].name, uploads[i].mimeType);
			}
		})();

		return rows.map(rowToKnowledgeFile);
	}

	/**
	 * Create library rows for cloud files and start download + extraction in
	 * the background. Validates provider, credential ownership, and
	 * provider/credential compatibility before anything is stored.
	 */
	async importFromCloud(
		ownerId: string,
		body: KnowledgeImportRequestBody,
	): Promise<KnowledgeFile[]> {
		const provider = this.providerRegistry.getById(body.provider);
		if (!provider) {
			throw new Error(`Unknown cloud provider: ${body.provider}`);
		}

		const credential = await this.credentialService.getById(body.credentialId, ownerId);
		if (!credential) {
			throw new Error('Credential not found.');
		}
		if (!this.providerRegistry.isCompatible(provider, credential.type)) {
			throw new Error(
				`Credential type '${credential.type}' is not compatible with provider '${provider.id}'.`,
			);
		}

		if (body.files.length === 0) {
			throw new Error('No files selected for import.');
		}
		if (body.files.length > MAX_IMPORT_FILES_PER_REQUEST) {
			throw new Error(`Too many files — maximum ${MAX_IMPORT_FILES_PER_REQUEST} per import.`);
		}
		for (const file of body.files) {
			const isGoogleNative =
				file.mimeType !== undefined && GOOGLE_NATIVE_IMPORTABLE_MIMES.has(file.mimeType);
			if (!isGoogleNative && !hasAllowedExtension(file.name)) {
				throw new Error(
					`Unsupported file type: ${file.name}. Allowed: ${ALLOWED_KNOWLEDGE_EXTENSIONS.join(', ')}.`,
				);
			}
			if (file.sizeBytes !== undefined && file.sizeBytes > MAX_KNOWLEDGE_FILE_BYTES) {
				throw new Error(
					`File too large: ${file.name}. Maximum size is ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)}MB.`,
				);
			}
		}

		const rows = await db
			.insert(knowledgeFiles)
			.values(
				body.files.map((file) => ({
					ownerId,
					name: file.name,
					sourceType: 'cloud' as const,
					provider: provider.id,
					credentialId: body.credentialId,
					externalId: file.externalId,
					externalPath: file.path ?? null,
					mimeType: file.mimeType ?? null,
					sizeBytes: file.sizeBytes ?? null,
				})),
			)
			.returning();

		void (async () => {
			for (let i = 0; i < rows.length; i++) {
				await this.downloadAndExtract(rows[i].id, ownerId, provider.id, body.credentialId, {
					externalId: body.files[i].externalId,
					name: body.files[i].name,
					mimeType: body.files[i].mimeType,
				});
			}
		})();

		return rows.map(rowToKnowledgeFile);
	}

	/**
	 * Delete a library file. Cascades to assignments and their memory chunks.
	 * Returns the number of agent assignments that were affected, or null when
	 * the file does not exist (or is not the owner's).
	 */
	async deleteFile(fileId: string, ownerId: string): Promise<{ affectedAgents: number } | null> {
		const assignments = await db
			.select({ id: agentKnowledgeFiles.id })
			.from(agentKnowledgeFiles)
			.where(eq(agentKnowledgeFiles.knowledgeFileId, fileId));

		const result = await db
			.delete(knowledgeFiles)
			.where(and(eq(knowledgeFiles.id, fileId), eq(knowledgeFiles.ownerId, ownerId)));

		if ((result.rowCount ?? 0) === 0) return null;
		return { affectedAgents: assignments.length };
	}

	// ─── Assignments ───────────────────────────────────────────────────────────

	async listAssignments(agentId: string, ownerId: string): Promise<AgentKnowledgeAssignment[]> {
		const rows = await db
			.select()
			.from(agentKnowledgeFiles)
			.innerJoin(knowledgeFiles, eq(agentKnowledgeFiles.knowledgeFileId, knowledgeFiles.id))
			.where(
				and(eq(agentKnowledgeFiles.agentId, agentId), eq(agentKnowledgeFiles.ownerId, ownerId)),
			)
			.orderBy(sql`${agentKnowledgeFiles.createdAt} DESC`);

		return rows.map((row) => rowToAssignment(row.agent_knowledge_files, row.knowledge_files));
	}

	/**
	 * Assign library files to an agent. Already-assigned files are skipped
	 * (idempotent). Ingestion runs in the background; new assignments are
	 * returned immediately with status 'pending'.
	 */
	async assign(
		agentId: string,
		ownerId: string,
		knowledgeFileIds: string[],
	): Promise<AgentKnowledgeAssignment[]> {
		const agent = await this.agentService.getById(agentId, ownerId);
		if (!agent) {
			throw new Error('Agent not found.');
		}
		if (knowledgeFileIds.length === 0) return [];

		// Only the owner's library files can be assigned
		const ownedFiles = await db
			.select({ id: knowledgeFiles.id })
			.from(knowledgeFiles)
			.where(
				and(inArray(knowledgeFiles.id, knowledgeFileIds), eq(knowledgeFiles.ownerId, ownerId)),
			);
		const ownedIds = new Set(ownedFiles.map((f) => f.id));
		const missing = knowledgeFileIds.filter((id) => !ownedIds.has(id));
		if (missing.length > 0) {
			throw new Error('One or more knowledge files were not found.');
		}

		const existing = await db
			.select({ knowledgeFileId: agentKnowledgeFiles.knowledgeFileId })
			.from(agentKnowledgeFiles)
			.where(
				and(
					eq(agentKnowledgeFiles.agentId, agentId),
					inArray(agentKnowledgeFiles.knowledgeFileId, knowledgeFileIds),
				),
			);
		const existingIds = new Set(existing.map((e) => e.knowledgeFileId));
		const newIds = knowledgeFileIds.filter((id) => !existingIds.has(id));
		if (newIds.length === 0) return [];

		const inserted = await db
			.insert(agentKnowledgeFiles)
			.values(newIds.map((knowledgeFileId) => ({ agentId, knowledgeFileId, ownerId })))
			.returning();

		void (async () => {
			for (const row of inserted) {
				await this.ingestAssignment(row.id);
			}
		})();

		// Re-select with joined file info for the response
		const insertedIds = inserted.map((row) => row.id);
		const rows = await db
			.select()
			.from(agentKnowledgeFiles)
			.innerJoin(knowledgeFiles, eq(agentKnowledgeFiles.knowledgeFileId, knowledgeFiles.id))
			.where(inArray(agentKnowledgeFiles.id, insertedIds));
		return rows.map((row) => rowToAssignment(row.agent_knowledge_files, row.knowledge_files));
	}

	/** Remove one assignment — the FK cascade deletes the agent's chunks */
	async unassign(agentId: string, ownerId: string, assignmentId: string): Promise<boolean> {
		const result = await db
			.delete(agentKnowledgeFiles)
			.where(
				and(
					eq(agentKnowledgeFiles.id, assignmentId),
					eq(agentKnowledgeFiles.agentId, agentId),
					eq(agentKnowledgeFiles.ownerId, ownerId),
				),
			);
		return (result.rowCount ?? 0) > 0;
	}

	/**
	 * Re-run chunking + embedding for one assignment from the stored segments.
	 * This is the recovery path after an embedding-model change or a transient
	 * ingestion failure. Returns the assignment (status 'pending') or throws
	 * with a conflict when it is already processing.
	 */
	async reprocessAssignment(
		assignmentId: string,
		agentId: string,
		ownerId: string,
	): Promise<AgentKnowledgeAssignment | null> {
		const rows = await db
			.select()
			.from(agentKnowledgeFiles)
			.innerJoin(knowledgeFiles, eq(agentKnowledgeFiles.knowledgeFileId, knowledgeFiles.id))
			.where(
				and(
					eq(agentKnowledgeFiles.id, assignmentId),
					eq(agentKnowledgeFiles.agentId, agentId),
					eq(agentKnowledgeFiles.ownerId, ownerId),
				),
			)
			.limit(1);
		if (!rows[0]) return null;
		if (rows[0].agent_knowledge_files.status === 'processing') {
			throw new Error('Assignment is already processing.');
		}

		await db
			.update(agentKnowledgeFiles)
			.set({ status: 'pending', errorMessage: null, updatedAt: new Date() })
			.where(eq(agentKnowledgeFiles.id, assignmentId));

		void this.ingestAssignment(assignmentId);

		const updated = {
			...rows[0].agent_knowledge_files,
			status: 'pending' as const,
			errorMessage: null,
		};
		return rowToAssignment(updated, rows[0].knowledge_files);
	}

	/** File names of 'ready' assignments — used for the agent's system-prompt note */
	async listReadyFileNamesForAgent(agentId: string): Promise<string[]> {
		const rows = await db
			.select({ name: knowledgeFiles.name })
			.from(agentKnowledgeFiles)
			.innerJoin(knowledgeFiles, eq(agentKnowledgeFiles.knowledgeFileId, knowledgeFiles.id))
			.where(
				and(eq(agentKnowledgeFiles.agentId, agentId), eq(agentKnowledgeFiles.status, 'ready')),
			);
		return rows.map((row) => row.name);
	}

	/**
	 * Startup sweep — rows left 'processing' by a backend crash/restart can
	 * never complete (the in-memory task is gone). Flip them to 'error' so
	 * users see an actionable state instead of a stuck spinner.
	 */
	async failInterruptedProcessing(): Promise<void> {
		const message = 'Processing was interrupted by a server restart — retry or reprocess.';
		const fileResult = await db
			.update(knowledgeFiles)
			.set({ status: 'error', errorMessage: message, updatedAt: new Date() })
			.where(eq(knowledgeFiles.status, 'processing'));
		const assignmentResult = await db
			.update(agentKnowledgeFiles)
			.set({ status: 'error', errorMessage: message, updatedAt: new Date() })
			.where(eq(agentKnowledgeFiles.status, 'processing'));
		const total = (fileResult.rowCount ?? 0) + (assignmentResult.rowCount ?? 0);
		if (total > 0) {
			logger.warn({ count: total }, '[knowledge] marked interrupted processing rows as error');
		}
	}

	// ─── Pipeline phase 1: extraction (library level) ──────────────────────────

	/**
	 * Extract text from raw bytes and persist the segments on the library row.
	 * Never throws — all failures land on the row's status/errorMessage.
	 * On success, re-ingests every assignment of this file.
	 */
	private async extractAndStore(
		fileId: string,
		data: Buffer,
		fileName: string,
		mimeType?: string,
	): Promise<void> {
		try {
			await db
				.update(knowledgeFiles)
				.set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
				.where(eq(knowledgeFiles.id, fileId));

			const result = await extractText({ data, fileName, mimeType });
			if (!result.ok) {
				await db
					.update(knowledgeFiles)
					.set({ status: 'error', errorMessage: result.errorMessage, updatedAt: new Date() })
					.where(eq(knowledgeFiles.id, fileId));
				logger.warn(
					{ fileId, fileName, errorCode: result.errorCode },
					'[knowledge] extraction failed',
				);
				return;
			}

			const segments = capSegments(result.segments, fileId, fileName);
			await db
				.update(knowledgeFiles)
				.set({
					status: 'ready',
					errorMessage: null,
					extractedSegments: segments,
					updatedAt: new Date(),
				})
				.where(eq(knowledgeFiles.id, fileId));

			logger.info(
				{ fileId, fileName, format: result.format, segmentCount: segments.length },
				'[knowledge] file extracted',
			);

			await this.ingestAssignmentsOfFile(fileId);
		} catch (err) {
			logger.warn({ err, fileId, fileName }, '[knowledge] extraction task failed (non-fatal)');
			await db
				.update(knowledgeFiles)
				.set({ status: 'error', errorMessage: truncateError(err), updatedAt: new Date() })
				.where(eq(knowledgeFiles.id, fileId))
				.catch(() => undefined);
		}
	}

	/** Cloud path: download via the provider, then extract */
	private async downloadAndExtract(
		fileId: string,
		ownerId: string,
		providerId: string,
		credentialId: string,
		file: { externalId: string; name: string; mimeType?: string },
	): Promise<void> {
		try {
			const provider = this.providerRegistry.getById(providerId);
			if (!provider) throw new Error(`Unknown cloud provider: ${providerId}`);

			await db
				.update(knowledgeFiles)
				.set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
				.where(eq(knowledgeFiles.id, fileId));

			const downloaded = await provider.download({ credentialId, ownerId }, file);
			if (downloaded.data.byteLength > MAX_KNOWLEDGE_FILE_BYTES) {
				throw new Error(
					`Downloaded file exceeds the ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)}MB limit.`,
				);
			}

			// Persist the post-export name/mime (e.g. Google Doc → "Report.docx")
			await db
				.update(knowledgeFiles)
				.set({
					name: downloaded.name,
					mimeType: downloaded.mimeType,
					sizeBytes: downloaded.data.byteLength,
					updatedAt: new Date(),
				})
				.where(eq(knowledgeFiles.id, fileId));

			await this.extractAndStore(fileId, downloaded.data, downloaded.name, downloaded.mimeType);
		} catch (err) {
			logger.warn({ err, fileId, providerId }, '[knowledge] cloud download failed (non-fatal)');
			await db
				.update(knowledgeFiles)
				.set({ status: 'error', errorMessage: truncateError(err), updatedAt: new Date() })
				.where(eq(knowledgeFiles.id, fileId))
				.catch(() => undefined);
		}
	}

	// ─── Pipeline phase 2: ingestion (assignment level) ────────────────────────

	/** Re-ingest every assignment of a file (after extraction or re-extraction) */
	private async ingestAssignmentsOfFile(fileId: string): Promise<void> {
		const assignments = await db
			.select({ id: agentKnowledgeFiles.id })
			.from(agentKnowledgeFiles)
			.where(eq(agentKnowledgeFiles.knowledgeFileId, fileId));
		for (const assignment of assignments) {
			await this.ingestAssignment(assignment.id);
		}
	}

	/**
	 * Chunk + embed one assignment into agent_memory. Never throws — failures
	 * land on the assignment's status/errorMessage. Leaves the assignment
	 * 'pending' while the library file is still extracting (it is re-ingested
	 * when extraction completes).
	 */
	private async ingestAssignment(assignmentId: string): Promise<void> {
		try {
			const rows = await db
				.select()
				.from(agentKnowledgeFiles)
				.innerJoin(knowledgeFiles, eq(agentKnowledgeFiles.knowledgeFileId, knowledgeFiles.id))
				.where(eq(agentKnowledgeFiles.id, assignmentId))
				.limit(1);
			if (!rows[0]) return; // unassigned while queued
			const assignment = rows[0].agent_knowledge_files;
			const file = rows[0].knowledge_files;

			if (file.status === 'pending' || file.status === 'processing') {
				return; // extraction still running — ingestAssignmentsOfFile will pick this up
			}
			if (file.status === 'error' || !file.extractedSegments) {
				await this.setAssignmentError(
					assignmentId,
					`Source file failed extraction: ${file.errorMessage ?? 'no extracted text available'}`,
				);
				return;
			}

			const agent = await this.agentService.getById(assignment.agentId, assignment.ownerId);
			if (!agent) {
				await this.setAssignmentError(assignmentId, 'Agent not found.');
				return;
			}
			if (!agent.embeddingModelConfigId) {
				await this.setAssignmentError(
					assignmentId,
					'Agent has no embedding model configured. Assign one in the agent settings, then reprocess.',
				);
				return;
			}

			await db
				.update(agentKnowledgeFiles)
				.set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
				.where(eq(agentKnowledgeFiles.id, assignmentId));

			const chunks = chunkSegments(file.extractedSegments);
			const embeddings: number[][] = [];
			for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
				const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
				const batchEmbeddings = await this.memoryService.embedBatch(
					batch.map((chunk) => chunk.content),
					agent.embeddingModelConfigId,
					assignment.ownerId,
				);
				embeddings.push(...batchEmbeddings);
			}

			// Idempotent re-ingestion: clear this assignment's previous chunks first
			await this.agentService.deleteMemoryByAssignment(assignmentId, assignment.agentId);
			await this.agentService.addMemoryBatch(
				chunks.map((chunk, i) => ({
					agentId: assignment.agentId,
					content: chunk.content,
					embedding: embeddings[i],
					memoryType: 'semantic' as const,
					isKnowledgeBase: true,
					agentKnowledgeFileId: assignmentId,
					metadata: {
						source: 'knowledge_base',
						fileName: file.name,
						fileId: file.id,
						location: chunk.location,
						chunkIndex: chunk.index,
					},
				})),
			);

			await db
				.update(agentKnowledgeFiles)
				.set({
					status: 'ready',
					errorMessage: null,
					chunkCount: chunks.length,
					updatedAt: new Date(),
				})
				.where(eq(agentKnowledgeFiles.id, assignmentId));

			logger.info(
				{ assignmentId, agentId: assignment.agentId, fileId: file.id, chunkCount: chunks.length },
				'[knowledge] assignment ingested',
			);
		} catch (err) {
			logger.warn({ err, assignmentId }, '[knowledge] ingestion failed (non-fatal)');
			await this.setAssignmentError(assignmentId, truncateError(err)).catch(() => undefined);
		}
	}

	private async setAssignmentError(assignmentId: string, message: string): Promise<void> {
		await db
			.update(agentKnowledgeFiles)
			.set({ status: 'error', errorMessage: message, updatedAt: new Date() })
			.where(eq(agentKnowledgeFiles.id, assignmentId));
	}
}

/** Enforce the stored-text cap, truncating the tail segment when exceeded */
function capSegments(
	segments: ExtractedSegment[],
	fileId: string,
	fileName: string,
): ExtractedSegment[] {
	const capped: ExtractedSegment[] = [];
	let total = 0;
	for (const segment of segments) {
		if (total + segment.text.length <= MAX_STORED_TEXT_CHARS) {
			capped.push(segment);
			total += segment.text.length;
			continue;
		}
		const remaining = MAX_STORED_TEXT_CHARS - total;
		if (remaining > 0) {
			capped.push({ ...segment, text: segment.text.slice(0, remaining) });
		}
		logger.warn(
			{ fileId, fileName, keptSegments: capped.length, totalSegments: segments.length },
			'[knowledge] extracted text exceeded the storage cap — truncated',
		);
		break;
	}
	return capped;
}
