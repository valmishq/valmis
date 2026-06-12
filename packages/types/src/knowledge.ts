import type { ApiResponse } from './api.js';

// ─── Extraction I/O (contract implemented by @repo/extractor) ─────────────────

/** How a segment's position in the source document is expressed */
export type SegmentLocationType = 'page' | 'slide' | 'sheet' | 'section' | 'lines';

/**
 * Position of an extracted segment inside its source file.
 * `label` is always present and human-readable — it is what the agent cites.
 */
export interface SegmentLocation {
	type: SegmentLocationType;
	/** e.g. "Page 3", "Slide 7", "Sheet 'Q1 Budget' rows 1–50", "Lines 81–160" */
	label: string;
	/** 1-based page number (pdf) */
	page?: number;
	/** 1-based slide number (pptx) */
	slide?: number;
	/** Sheet name (xlsx) */
	sheet?: string;
	/** 1-based inclusive start of a line/row/paragraph range */
	start?: number;
	/** 1-based inclusive end of a line/row/paragraph range */
	end?: number;
}

/** One locatable unit of extracted text. Chunks never cross segment boundaries. */
export interface ExtractedSegment {
	location: SegmentLocation;
	text: string;
}

/** File formats the unified text extractor understands */
export type ExtractedFormat =
	| 'pdf'
	| 'docx'
	| 'xlsx'
	| 'pptx'
	| 'text'
	| 'markdown'
	| 'csv'
	| 'json'
	| 'html';

/** Input to the unified text extractor */
export interface ExtractionInput {
	/** Raw file bytes */
	data: Uint8Array;
	fileName: string;
	mimeType?: string;
	options?: ExtractionOptions;
}

export interface ExtractionOptions {
	/** Reserved for a future OCR pass on image-only PDFs / images. No-op today. */
	ocr?: boolean;
}

export type ExtractionErrorCode =
	| 'unsupported_format'
	| 'corrupt_file'
	| 'password_protected'
	| 'empty_document'
	| 'extraction_failed';

/** Discriminated extraction result — expected failures never throw */
export type ExtractionResult =
	| { ok: true; format: ExtractedFormat; segments: ExtractedSegment[]; warnings: string[] }
	| { ok: false; errorCode: ExtractionErrorCode; errorMessage: string };

// ─── Chunking ─────────────────────────────────────────────────────────────────

export interface ChunkOptions {
	/** Soft target chunk size in words (default 400) */
	targetWords?: number;
	/** Hard maximum chunk size in words (default 600) */
	maxWords?: number;
	/** Trailing chunks below this merge into the previous chunk of the same segment (default 40) */
	minWords?: number;
}

/** One embeddable chunk produced from a file's extracted segments */
export interface KnowledgeChunk {
	content: string;
	location: SegmentLocation;
	/** 0-based position within the file's full chunk sequence */
	index: number;
}

// ─── Knowledge library files ──────────────────────────────────────────────────

export type KnowledgeSourceType = 'upload' | 'cloud';

/**
 * Shared status enum. On a library file it tracks text extraction;
 * on an agent assignment it tracks chunking + embedding into agent memory.
 */
export type KnowledgeFileStatus = 'pending' | 'processing' | 'ready' | 'error';

/** A file in the user-level knowledge library */
export interface KnowledgeFile {
	id: string;
	ownerId: string;
	name: string;
	sourceType: KnowledgeSourceType;
	/** Cloud provider id (e.g. 'google-drive') — only for sourceType 'cloud' */
	provider?: string;
	/** Credential used for cloud import — undefined after credential deletion (SET NULL) */
	credentialId?: string;
	externalId?: string;
	externalPath?: string;
	mimeType?: string;
	sizeBytes?: number;
	/** Library-level text extraction status */
	status: KnowledgeFileStatus;
	errorMessage?: string;
	/** True when extracted segments are stored — re-ingestion works without re-download */
	hasExtractedText: boolean;
	createdAt: Date;
	updatedAt: Date;
}

// ─── Agent assignments ────────────────────────────────────────────────────────

/** A knowledge file assigned to an agent, with its per-agent ingestion state */
export interface AgentKnowledgeAssignment {
	id: string;
	agentId: string;
	knowledgeFileId: string;
	/** Per-assignment ingestion (chunk + embed) status */
	status: KnowledgeFileStatus;
	errorMessage?: string;
	chunkCount: number;
	createdAt: Date;
	updatedAt: Date;
	/** Joined library file info for display */
	file: Pick<
		KnowledgeFile,
		'name' | 'sourceType' | 'provider' | 'mimeType' | 'sizeBytes' | 'status'
	>;
}

// ─── Cloud browsing ───────────────────────────────────────────────────────────

export interface CloudFileEntry {
	externalId: string;
	name: string;
	kind: 'file' | 'folder';
	mimeType?: string;
	sizeBytes?: number;
	/** ISO 8601 */
	modifiedAt?: string;
	/** Provider path where meaningful (e.g. Dropbox path_display) */
	path?: string;
}

export interface CloudFileListResult {
	entries: CloudFileEntry[];
	nextPageToken?: string;
}

export interface KnowledgeProviderInfo {
	id: string;
	displayName: string;
	icon?: string;
	/** Credential definition ids accepted by this provider */
	compatibleCredentialTypes: string[];
	/** The authenticated user's credentials usable with this provider */
	credentials: { id: string; name: string; type: string }[];
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

/** POST /v1/knowledge/files/import — import files from a cloud provider */
export interface KnowledgeImportRequestBody {
	provider: string;
	credentialId: string;
	files: {
		externalId: string;
		name: string;
		mimeType?: string;
		path?: string;
		sizeBytes?: number;
	}[];
}

/** POST /v1/agents/:agentId/knowledge — assign library files to an agent */
export interface AssignKnowledgeRequestBody {
	knowledgeFileIds: string[];
}

// ─── API Response Envelopes ───────────────────────────────────────────────────

export type KnowledgeFilesListResponse = ApiResponse<KnowledgeFile[]>;
export type KnowledgeFileResponse = ApiResponse<KnowledgeFile>;
export type KnowledgeImportResponse = ApiResponse<KnowledgeFile[]>;
export type KnowledgeFileDeleteResponse = ApiResponse<{ deleted: boolean; affectedAgents: number }>;
export type AgentKnowledgeListResponse = ApiResponse<AgentKnowledgeAssignment[]>;
export type AgentKnowledgeAssignResponse = ApiResponse<AgentKnowledgeAssignment[]>;
export type AgentKnowledgeUnassignResponse = ApiResponse<{ removed: boolean }>;
export type AgentKnowledgeReprocessResponse = ApiResponse<AgentKnowledgeAssignment>;
export type KnowledgeProvidersResponse = ApiResponse<KnowledgeProviderInfo[]>;
export type CloudFileBrowseResponse = ApiResponse<CloudFileListResult>;
