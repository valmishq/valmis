import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '@repo/utils';
import { resolveWorkspacePath } from './types.js';
import type { ToolContext } from './types.js';

/**
 * write_file — Write content to a file in the agent's persistent workspace.
 *
 * Creates parent directories automatically if they do not exist.
 * Overwrites the file if it already exists.
 * Path traversal is rejected by resolveWorkspacePath.
 */
export function createWriteFileTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'write_file',
		label: 'Write File',
		description:
			"Write content to a file in the agent's persistent workspace. " +
			'Creates parent directories if needed. Overwrites if file already exists.',
		parameters: Type.Object({
			path: Type.String({
				description: 'Relative path to the file, e.g. "output/result.json"',
			}),
			content: Type.String({ description: 'Text content to write' }),
		}),
		execute: async (_toolCallId, params) => {
			const { path: relativePath, content: fileContent } = params as {
				path: string;
				content: string;
			};
			const resolved = resolveWorkspacePath(ctx.workspaceRoot, relativePath);

			// Ensure parent directories exist before writing
			mkdirSync(dirname(resolved), { recursive: true });
			writeFileSync(resolved, fileContent, 'utf-8');

			logger.debug({ path: relativePath, bytes: fileContent.length }, '[agent-runner] write_file');

			const textContent: TextContent = {
				type: 'text',
				text: `Written ${fileContent.length} bytes to ${relativePath}`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
