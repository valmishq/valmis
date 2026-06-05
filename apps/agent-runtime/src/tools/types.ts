import { resolve, sep } from 'path';
import type { ProxyClient } from '../proxy-client.js';

/**
 * Shared dependency bag passed to every tool factory.
 *
 * Extend this interface when a new tool needs additional dependencies
 * (e.g. a memory client, an embeddings service, etc.).  All existing
 * factories receive the full context object, so extending it is a
 * non-breaking change.
 */
export interface ToolContext {
	/** Client for all sandbox → host HTTP calls (credential proxy + LLM proxy). */
	proxyClient: ProxyClient;
	/** Absolute path to this agent's persistent workspace directory. */
	workspaceRoot: string;
	/**
	 * Maximum allowed body size in bytes for the call_api tool.
	 * Defaults to 1 MB (1_048_576 bytes).
	 */
	callApiMaxBodyBytes?: number;
}

/**
 * Resolve a user-supplied relative path against the workspace root.
 * Throws if the resolved path escapes the workspace (path traversal guard).
 *
 * Uses a separator-aware prefix check to prevent the classic bypass where
 * a path like /workspace/abc-evil would pass a naive startsWith('/workspace/abc').
 */
export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
	const resolved = resolve(workspaceRoot, relativePath);
	// Ensure the resolved path is exactly workspaceRoot or a strict child of it.
	// Adding sep prevents prefix confusion: "/workspace/abc" must not match "/workspace/abc-evil".
	const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
	if (resolved !== workspaceRoot && !resolved.startsWith(rootWithSep)) {
		throw new Error(`Path traversal not allowed: ${relativePath}`);
	}
	return resolved;
}
