import type { ApiResponse } from './api.js';

// ─── Enum mirrors (TypeScript unions matching the pgEnum values) ──────────────

export type ChatFileSource = 'user_upload' | 'agent_output';
export type ChatFileKind = 'image' | 'document';
export type ChatFileExtractionStatus = 'pending' | 'processing' | 'ready' | 'error' | 'skipped';

// ─── Chat file ─────────────────────────────────────────────────────────────────

/**
 * A file attached to a chat thread — a user upload or a file the agent shared
 * back. Raw bytes live on the backend-owned host volume (CHAT_FILES_PATH); this
 * is the metadata surfaced to the frontend. The bytes are fetched via the file
 * serving route, never inlined here.
 */
export interface ChatFile {
	id: string;
	ownerId: string;
	threadId: string;
	/** Message this file renders under — null until linked. */
	messageId?: string;
	source: ChatFileSource;
	kind: ChatFileKind;
	name: string;
	mimeType: string;
	sizeBytes: number;
	extractionStatus: ChatFileExtractionStatus;
	errorMessage?: string;
	createdAt: Date;
	updatedAt: Date;
}

// ─── API response envelopes ─────────────────────────────────────────────────────

/** POST /v1/runtime/:agentId/threads/:threadId/files — multipart upload result */
export type ChatFileUploadResponse = ApiResponse<ChatFile[]>;
/** GET /v1/runtime/:agentId/threads/:threadId/files — list a thread's files */
export type ChatFilesListResponse = ApiResponse<ChatFile[]>;
/** DELETE /v1/runtime/:agentId/threads/:threadId/files/:fileId */
export type ChatFileDeleteResponse = ApiResponse<{ deleted: boolean }>;
