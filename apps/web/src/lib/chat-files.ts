import { api } from './api.client.js';

/**
 * Helpers for fetching chat file bytes. The serving route is authenticated via
 * the Bearer token (header), so an <img src> / <iframe src> cannot load it
 * directly — instead we fetch the bytes through the api client and hand back an
 * object URL the caller is responsible for revoking.
 */

function filePath(agentId: string, threadId: string, fileId: string, download = false): string {
	return `/runtime/${agentId}/threads/${threadId}/files/${fileId}${download ? '?download=1' : ''}`;
}

/** Fetch a file's bytes and return an object URL (caller must URL.revokeObjectURL it). */
export async function fetchChatFileObjectUrl(
	agentId: string,
	threadId: string,
	fileId: string
): Promise<string> {
	const res = await api(filePath(agentId, threadId, fileId));
	if (!res.ok) throw new Error('Failed to load file');
	const blob = await res.blob();
	return URL.createObjectURL(blob);
}

/** Fetch a file's bytes as text (for previewing txt/markdown/etc.). */
export async function fetchChatFileText(
	agentId: string,
	threadId: string,
	fileId: string
): Promise<string> {
	const res = await api(filePath(agentId, threadId, fileId));
	if (!res.ok) throw new Error('Failed to load file');
	return res.text();
}

/** Fetch a file as an attachment and trigger a browser download. */
export async function downloadChatFile(
	agentId: string,
	threadId: string,
	fileId: string,
	name: string
): Promise<void> {
	const res = await api(filePath(agentId, threadId, fileId, true));
	if (!res.ok) throw new Error('Failed to download file');
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Human-readable byte size, e.g. "1.2 MB". */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
