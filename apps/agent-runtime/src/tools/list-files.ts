import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { readdirSync } from 'fs';
import { logger } from '@repo/utils';
import { resolveWorkspacePath } from './types.js';
import type { ToolContext } from './types.js';

/**
 * list_files — List files and directories in the agent's persistent workspace.
 *
 * Path is relative to the workspace root; defaults to the workspace root itself.
 * Path traversal is rejected by resolveWorkspacePath.
 */
export function createListFilesTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'list_files',
		label: 'List Files',
		description:
			"List files and directories in the agent's persistent workspace. " +
			'Path is relative to the workspace root. Defaults to the workspace root.',
		parameters: Type.Object({
			path: Type.Optional(
				Type.String({
					description: 'Relative path to list, e.g. "data/". Defaults to "."',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { path: relativePath = '.' } = params as { path?: string };
			const resolved = resolveWorkspacePath(ctx.workspaceRoot, relativePath);
			const entries = readdirSync(resolved, { withFileTypes: true });

			const listing = entries.map((e) => ({
				name: e.name,
				type: e.isDirectory() ? 'directory' : 'file',
			}));

			logger.debug({ path: relativePath, count: listing.length }, '[agent-runner] list_files');

			const textContent: TextContent = {
				type: 'text',
				text: JSON.stringify(listing, null, 2),
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
