import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	rmSync,
	copyFileSync,
	statSync,
} from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { extractText } from '@repo/extractor';
import { LLM_MODELS } from '@repo/models';
import type { ChatFile, ChatFileKind, ContentBlock } from '@repo/types';
import { db } from '../db/index.js';
import { chatFiles } from '../db/schema/index.js';
import { logger } from '../config/logger.js';
import type { AgentService } from './AgentService.js';
import type { LlmProviderService } from './LlmProviderService.js';

// ─── Limits & allowlists ────────────────────────────────────────────────────

/** Max original file size accepted for a chat upload (matches the knowledge cap). */
export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
/** Max files per upload request. */
export const MAX_CHAT_FILES_PER_REQUEST = 10;
/** Cap on stored extracted text per document (characters). */
const MAX_STORED_TEXT_CHARS = 2 * 1024 * 1024;

/** Image extensions sent directly to vision models (no text extraction). */
const IMAGE_EXTENSIONS: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
};

/**
 * Document extensions handled by @repo/extractor, mapped to their real MIME types.
 * A correct MIME matters for serving: the browser uses the served Content-Type to
 * decide whether to render a file inline (e.g. a PDF in an iframe) or download it.
 * Agent-shared files have no browser-supplied MIME, so this is the only source.
 */
const DOCUMENT_MIMES: Record<string, string> = {
	pdf: 'application/pdf',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	txt: 'text/plain',
	md: 'text/markdown',
	markdown: 'text/markdown',
	csv: 'text/csv',
	json: 'application/json',
	html: 'text/html',
	htm: 'text/html',
};

function extensionOf(fileName: string): string {
	const idx = fileName.lastIndexOf('.');
	return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase();
}

/**
 * Detect a supported image's real MIME type from its leading magic bytes, or
 * null when the bytes are not one of our allowed image formats. Neither the
 * client-supplied MIME nor the file extension is trusted for images — they are
 * served inline and fed to vision models, so the content must be verified
 * (mirrors the knowledge pipeline's magic-byte stance, and keeps SVG/HTML or
 * arbitrary binaries from being smuggled in under an image extension).
 */
function sniffImageMime(data: Buffer): string | null {
	if (data.length < 12) return null;
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47 &&
		data[4] === 0x0d &&
		data[5] === 0x0a &&
		data[6] === 0x1a &&
		data[7] === 0x0a
	)
		return 'image/png';
	// JPEG: FF D8 FF
	if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
	// GIF: "GIF8"
	if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38)
		return 'image/gif';
	// WEBP: "RIFF"<4 bytes>"WEBP"
	if (
		data[0] === 0x52 &&
		data[1] === 0x49 &&
		data[2] === 0x46 &&
		data[3] === 0x46 &&
		data[8] === 0x57 &&
		data[9] === 0x45 &&
		data[10] === 0x42 &&
		data[11] === 0x50
	)
		return 'image/webp';
	return null;
}

/** Classify an upload by extension, or null when the type is not allowed. */
function classify(fileName: string): { kind: ChatFileKind; mimeType: string } | null {
	const ext = extensionOf(fileName);
	if (ext in IMAGE_EXTENSIONS) return { kind: 'image', mimeType: IMAGE_EXTENSIONS[ext] };
	if (ext in DOCUMENT_MIMES) return { kind: 'document', mimeType: DOCUMENT_MIMES[ext] };
	return null;
}

/**
 * Best Content-Type to SERVE a stored file with. Prefers the stored mime, but
 * re-derives from the file extension when it is missing or generic
 * ('application/octet-stream') — generic types make browsers download instead of
 * previewing inline. Also repairs rows written before mimes were derived correctly.
 */
export function resolveServeMimeType(name: string, storedMime: string): string {
	if (storedMime && storedMime !== 'application/octet-stream') return storedMime;
	return classify(name)?.mimeType ?? 'application/octet-stream';
}

/** Strip path separators from a name so it is safe to use as a single path segment. */
function safeName(name: string): string {
	return name.replace(/[/\\]/g, '_');
}

export interface ChatUploadInput {
	name: string;
	mimeType?: string;
	sizeBytes: number;
	data: Buffer;
}

function rowToChatFile(row: typeof chatFiles.$inferSelect): ChatFile {
	return {
		id: row.id,
		ownerId: row.ownerId,
		threadId: row.threadId,
		messageId: row.messageId ?? undefined,
		source: row.source,
		kind: row.kind,
		name: row.name,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes,
		extractionStatus: row.extractionStatus,
		errorMessage: row.errorMessage ?? undefined,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/**
 * Manages chat file uploads and agent-shared files.
 *
 * Storage model: raw bytes live on the backend-owned host volume (CHAT_FILES_PATH)
 * under "<ownerId>/<fileId>"; extracted document text is cached alongside as
 * "<ownerId>/<fileId>.txt". The backend serves bytes to the browser and copies
 * referenced files into the agent workspace at spawn time (see materializeThreadFiles).
 * The host volume is NEVER mounted into a runtime.
 */
export class ChatFileService {
	private readonly basePath: string;

	constructor(
		private readonly agentService: AgentService,
		private readonly llmProviderService: LlmProviderService,
	) {
		// Backend-only store — NEVER under AGENT_WORKSPACES_PATH. Default: repo-root
		// sibling. In docker-compose this is the consolidated app-data volume.
		this.basePath = process.env.CHAT_FILES_PATH ?? resolve(process.cwd(), '../../.chat-files');
	}

	/**
	 * Storage key for a file — deterministic from owner + id, so the ChatFile DTO
	 * never needs to expose the internal storage path.
	 */
	private storageKeyFor(file: Pick<ChatFile, 'ownerId' | 'id'>): string {
		return `${file.ownerId}/${file.id}`;
	}

	/** Absolute path to a file's bytes on the host volume. */
	private absPath(storageKey: string): string {
		return join(this.basePath, storageKey);
	}

	/** Absolute path to a document's cached extracted-text sidecar. */
	private textSidecarPath(storageKey: string): string {
		return join(this.basePath, `${storageKey}.txt`);
	}

	/**
	 * Whether the agent's chat model can accept image input. Resolved from the LLM
	 * catalog's input modalities (same source resolveAgentModel uses). Returns
	 * false when the agent or its model config cannot be resolved.
	 */
	async agentSupportsVision(agentId: string, ownerId: string): Promise<boolean> {
		const agent = await this.agentService.getById(agentId, ownerId);
		if (!agent?.modelConfigId) return false;
		const config = await this.llmProviderService.getById(agent.modelConfigId, ownerId);
		if (!config) return false;
		const catalogEntry =
			LLM_MODELS.find((m) => m.id === config.model) ??
			LLM_MODELS.find((m) => m.id.endsWith('/' + config.model));
		return (catalogEntry?.architecture?.inputModalities ?? []).includes('image');
	}

	/**
	 * Persist a batch of user uploads for a thread (web path). Validates type/size,
	 * writes bytes, inserts rows, kicks off background text extraction. THROWS on the
	 * first invalid file (the web UI surfaces the error). Image uploads are rejected
	 * when the agent's model has no vision capability (the friendly-fallback gate).
	 */
	async saveUploads(
		agentId: string,
		ownerId: string,
		threadId: string,
		uploads: ChatUploadInput[],
	): Promise<ChatFile[]> {
		const visionCapable = await this.resolveVisionForBatch(agentId, ownerId, uploads);
		const created: ChatFile[] = [];
		for (const upload of uploads) {
			created.push(await this.ingestOne(ownerId, threadId, upload, visionCapable));
		}
		return created;
	}

	/**
	 * Lenient ingest for channels (Telegram/Discord) where one bad attachment must
	 * NOT drop the whole message. Same storage/extraction as saveUploads, but never
	 * throws — unsupported, oversized, or vision-gated files are recorded in `skipped`
	 * with a reason so the caller can tell the agent.
	 */
	async ingestFiles(
		agentId: string,
		ownerId: string,
		threadId: string,
		inputs: ChatUploadInput[],
	): Promise<{ created: ChatFile[]; skipped: { name: string; reason: string }[] }> {
		const visionCapable = await this.resolveVisionForBatch(agentId, ownerId, inputs);
		const created: ChatFile[] = [];
		const skipped: { name: string; reason: string }[] = [];
		for (const input of inputs) {
			try {
				created.push(await this.ingestOne(ownerId, threadId, input, visionCapable));
			} catch (err) {
				skipped.push({
					name: input.name,
					reason: err instanceof Error ? err.message : 'could not process file',
				});
			}
		}
		return { created, skipped };
	}

	/** Resolve vision capability once per batch — only when an image is present. */
	private async resolveVisionForBatch(
		agentId: string,
		ownerId: string,
		inputs: ChatUploadInput[],
	): Promise<boolean> {
		const hasImage = inputs.some((i) => classify(i.name)?.kind === 'image');
		return hasImage ? this.agentSupportsVision(agentId, ownerId) : false;
	}

	/**
	 * Validate + persist a single user-uploaded file. Throws on validation failure
	 * (unsupported type, too large, image without vision). Shared by saveUploads
	 * (which lets it throw) and ingestFiles (which catches per file).
	 */
	private async ingestOne(
		ownerId: string,
		threadId: string,
		upload: ChatUploadInput,
		visionCapable: boolean,
	): Promise<ChatFile> {
		const classified = classify(upload.name);
		if (!classified) {
			throw new Error(
				`Unsupported file type: "${upload.name}". Allowed: images (png, jpg, webp, gif) and documents (pdf, docx, xlsx, pptx, txt, md, csv, json, html).`,
			);
		}
		if (upload.sizeBytes > MAX_CHAT_FILE_BYTES) {
			throw new Error(`"${upload.name}" exceeds the ${MAX_CHAT_FILE_BYTES / (1024 * 1024)}MB limit.`);
		}
		if (classified.kind === 'image' && !visionCapable) {
			throw new Error("this agent's model cannot view images");
		}

		let mimeType: string;
		if (classified.kind === 'image') {
			// Verify the bytes really are a supported image and use the DETECTED type
			// as authoritative — the extension and client MIME are not trusted, so a
			// renamed binary, SVG, or HTML payload cannot ride in under an image name.
			const sniffed = sniffImageMime(upload.data);
			if (!sniffed) {
				throw new Error(`"${upload.name}" is not a valid image (png, jpg, webp, gif).`);
			}
			mimeType = sniffed;
		} else {
			// Documents: prefer the supplied mime only when it is specific; otherwise
			// use our extension-derived type. A generic/empty mime (e.g.
			// 'application/octet-stream') would otherwise break inline preview/serving.
			const suppliedMime = upload.mimeType;
			const suppliedMimeUsable = !!suppliedMime && suppliedMime !== 'application/octet-stream';
			mimeType = suppliedMimeUsable ? suppliedMime : classified.mimeType;
		}

		const [row] = await db
			.insert(chatFiles)
			.values({
				ownerId,
				threadId,
				source: 'user_upload',
				kind: classified.kind,
				name: upload.name,
				mimeType,
				sizeBytes: upload.sizeBytes,
				// Placeholder — rewritten below now that we have the generated id.
				storageKey: 'pending',
				extractionStatus: classified.kind === 'image' ? 'skipped' : 'pending',
			})
			.returning();

		const storageKey = `${ownerId}/${row.id}`;
		const [updated] = await db
			.update(chatFiles)
			.set({ storageKey, updatedAt: new Date() })
			.where(eq(chatFiles.id, row.id))
			.returning();

		// Write bytes to the host volume.
		const target = this.absPath(storageKey);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, upload.data);

		// Background extraction for documents (fire-and-forget, status guards re-entry).
		if (classified.kind === 'document') {
			void this.extractDocument(row.id, storageKey, upload.name, upload.data);
		}

		return rowToChatFile(updated);
	}

	/** Extract document text into a sidecar and update the row status. Best-effort. */
	private async extractDocument(
		fileId: string,
		storageKey: string,
		fileName: string,
		data: Buffer,
	): Promise<void> {
		try {
			await db
				.update(chatFiles)
				.set({ extractionStatus: 'processing', updatedAt: new Date() })
				.where(eq(chatFiles.id, fileId));

			const result = await extractText({
				data: new Uint8Array(data),
				fileName,
			});

			if (result.ok) {
				const text = result.segments
					.map((s) => s.text)
					.join('\n\n')
					.slice(0, MAX_STORED_TEXT_CHARS);
				writeFileSync(this.textSidecarPath(storageKey), text, 'utf-8');
				await db
					.update(chatFiles)
					.set({ extractionStatus: 'ready', updatedAt: new Date() })
					.where(eq(chatFiles.id, fileId));
				return;
			}

			// No extractable text (e.g. a scanned PDF) is not a hard failure — the raw
			// file is still materialized into the workspace so the agent can parse it.
			const skipped = result.errorCode === 'empty_document';
			await db
				.update(chatFiles)
				.set({
					extractionStatus: skipped ? 'skipped' : 'error',
					errorMessage: result.errorMessage,
					updatedAt: new Date(),
				})
				.where(eq(chatFiles.id, fileId));
		} catch (err) {
			logger.warn({ err, fileId }, '[chat-files] document extraction failed');
			await db
				.update(chatFiles)
				.set({
					extractionStatus: 'error',
					errorMessage: err instanceof Error ? err.message : 'Extraction failed',
					updatedAt: new Date(),
				})
				.where(eq(chatFiles.id, fileId))
				.catch(() => {});
		}
	}

	/** Workspace-relative path a file is materialized to (and referenced in prompts). */
	workspaceRelPath(file: ChatFile): string {
		return `uploads/${file.id}/${safeName(file.name)}`;
	}

	/**
	 * Build the prompt content blocks for an attached file:
	 *   - image (vision model) → an image block plus a short workspace-path note
	 *   - image (no vision)     → a text note (the upload gate normally prevents this)
	 *   - document              → the extracted text (or a note pointing at the raw
	 *                             file in the workspace when no text was extracted)
	 */
	buildPromptBlocks(file: ChatFile, visionCapable: boolean): ContentBlock[] {
		const relPath = this.workspaceRelPath(file);

		if (file.kind === 'image') {
			if (visionCapable && existsSync(this.absPath(this.storageKeyFor(file)))) {
				const data = readFileSync(this.absPath(this.storageKeyFor(file))).toString('base64');
				return [
					{ type: 'image', data, mimeType: file.mimeType },
					{ type: 'text', text: `(Attached image "${file.name}", also at ${relPath} in your workspace.)` },
				];
			}
			return [
				{
					type: 'text',
					text: `[Attached image "${file.name}" at ${relPath} in your workspace. This model cannot view images directly.]`,
				},
			];
		}

		// Document
		const text = this.readExtractedText(file);
		if (text && text.trim().length > 0) {
			return [
				{
					type: 'text',
					text: `Attached document "${file.name}" (also available at ${relPath} in your workspace):\n\n${text}`,
				},
			];
		}
		return [
			{
				type: 'text',
				text: `[Attached document "${file.name}" at ${relPath} in your workspace. No text could be extracted automatically — read or parse the raw file from your workspace if you need its contents.]`,
			},
		];
	}

	/** Read a document's cached extracted text, or null when absent. */
	private readExtractedText(file: ChatFile): string | null {
		const path = this.textSidecarPath(this.storageKeyFor(file));
		if (!existsSync(path)) return null;
		try {
			return readFileSync(path, 'utf-8');
		} catch {
			return null;
		}
	}

	// ─── Lookups ────────────────────────────────────────────────────────────

	/** Fetch a single file scoped to its owner (null when not found / not owned). */
	async getForOwner(fileId: string, ownerId: string): Promise<ChatFile | null> {
		const rows = await db
			.select()
			.from(chatFiles)
			.where(and(eq(chatFiles.id, fileId), eq(chatFiles.ownerId, ownerId)))
			.limit(1);
		return rows[0] ? rowToChatFile(rows[0]) : null;
	}

	/** List all files for a thread (oldest first), scoped to the owner. */
	async listForThread(threadId: string, ownerId: string): Promise<ChatFile[]> {
		const rows = await db
			.select()
			.from(chatFiles)
			.where(and(eq(chatFiles.threadId, threadId), eq(chatFiles.ownerId, ownerId)))
			.orderBy(chatFiles.createdAt);
		return rows.map(rowToChatFile);
	}

	/** Absolute path to a file's bytes for the serving route. */
	absolutePathFor(file: ChatFile): string {
		return this.absPath(this.storageKeyFor(file));
	}

	/** Read a file's raw bytes from the host volume. */
	readBytes(file: ChatFile): Buffer {
		return readFileSync(this.absPath(this.storageKeyFor(file)));
	}

	// ─── Linking & cleanup ────────────────────────────────────────────────────

	/**
	 * Link a set of files to a persisted message (used after the user message
	 * inserts). Scoped to BOTH the owner AND the thread: a client-supplied fileId
	 * that belongs to a different thread (even the same owner's) is ignored, so it
	 * cannot be re-pointed at this thread's message and corrupt rendering.
	 */
	async attachToMessage(
		fileIds: string[],
		messageId: string,
		threadId: string,
		ownerId: string,
	): Promise<void> {
		if (fileIds.length === 0) return;
		await db
			.update(chatFiles)
			.set({ messageId, updatedAt: new Date() })
			.where(
				and(
					inArray(chatFiles.id, fileIds),
					eq(chatFiles.threadId, threadId),
					eq(chatFiles.ownerId, ownerId),
				),
			);
	}

	/** Delete a file (row + bytes + sidecar). Returns false when not found. */
	async delete(fileId: string, ownerId: string): Promise<boolean> {
		const file = await this.getForOwner(fileId, ownerId);
		if (!file) return false;
		await db.delete(chatFiles).where(eq(chatFiles.id, fileId));
		const storageKey = this.storageKeyFor(file);
		rmSync(this.absPath(storageKey), { force: true });
		rmSync(this.textSidecarPath(storageKey), { force: true });
		return true;
	}

	// ─── Workspace materialization ──────────────────────────────────────────

	/**
	 * Copy a thread's user-uploaded files into <workspacePath>/uploads/<fileId>/<name>
	 * so the agent can read/parse the raw bytes with its file tools. Mirrors the
	 * SkillMaterializer pattern: best-effort, a single file failing never fails the turn.
	 */
	async materializeThreadFiles(threadId: string, ownerId: string, workspacePath: string): Promise<void> {
		const files = await this.listForThread(threadId, ownerId);
		const uploads = files.filter((f) => f.source === 'user_upload');
		for (const file of uploads) {
			try {
				const src = this.absPath(this.storageKeyFor(file));
				if (!existsSync(src)) continue;
				const target = this.resolveWithinDir(
					join(workspacePath, 'uploads'),
					`${file.id}/${safeName(file.name)}`,
				);
				mkdirSync(dirname(target), { recursive: true, mode: 0o755 });
				copyFileSync(src, target);
			} catch (err) {
				logger.warn(
					{ err, fileId: file.id, threadId },
					'[chat-files] failed to materialize upload into workspace — skipping',
				);
			}
		}
	}

	/**
	 * Register a file the agent produced in its workspace as a shared chat file:
	 * copies the bytes into the host volume, inserts an agent_output row linked to
	 * the given message, and returns the persisted ChatFile. The caller emits the
	 * file_shared SSE event.
	 */
	async registerAgentOutput(input: {
		agentId: string;
		ownerId: string;
		threadId: string;
		messageId: string | null;
		workspacePath: string;
		relPath: string;
	}): Promise<ChatFile> {
		const src = this.resolveWithinDir(input.workspacePath, input.relPath);
		if (!existsSync(src)) {
			throw new Error(`File not found in workspace: ${input.relPath}`);
		}
		const size = statSync(src).size;
		if (size > MAX_CHAT_FILE_BYTES) {
			throw new Error(`File exceeds the ${MAX_CHAT_FILE_BYTES / (1024 * 1024)}MB limit.`);
		}

		const name = safeName(input.relPath.split('/').pop() || 'file');
		const classified = classify(name);
		const kind: ChatFileKind = classified?.kind ?? 'document';
		const mimeType = classified?.mimeType ?? 'application/octet-stream';

		const [row] = await db
			.insert(chatFiles)
			.values({
				ownerId: input.ownerId,
				threadId: input.threadId,
				messageId: input.messageId,
				source: 'agent_output',
				kind,
				name,
				mimeType,
				sizeBytes: size,
				storageKey: 'pending',
				extractionStatus: 'skipped',
			})
			.returning();

		const storageKey = `${input.ownerId}/${row.id}`;
		const target = this.absPath(storageKey);
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(src, target);

		const [updated] = await db
			.update(chatFiles)
			.set({ storageKey, updatedAt: new Date() })
			.where(eq(chatFiles.id, row.id))
			.returning();

		return rowToChatFile(updated);
	}

	/**
	 * Separator-aware containment check (same approach as SkillMaterializer) — a
	 * relative path must resolve to a strict child of baseDir.
	 */
	private resolveWithinDir(baseDir: string, relativePath: string): string {
		const resolved = resolve(baseDir, relativePath);
		const baseWithSep = baseDir.endsWith(sep) ? baseDir : baseDir + sep;
		if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) {
			throw new Error(`Path escapes its directory: ${relativePath}`);
		}
		return resolved;
	}
}
