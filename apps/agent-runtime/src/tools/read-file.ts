import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { readFileSync } from 'fs';
import { logger } from '@repo/utils';
import { resolveWorkspacePath, detectSkillRead } from './types.js';
import type { ToolContext } from './types.js';

/**
 * read_file — Read a file from the agent's persistent workspace.
 *
 * Path is relative to the workspace root.  Absolute paths and traversal
 * sequences (e.g. `../`) are rejected by resolveWorkspacePath.
 */
export function createReadFileTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'read_file',
		label: 'Read File',
		description:
			"Read the contents of a file from the agent's persistent workspace. " +
			'Path is relative to the workspace root.',
		parameters: Type.Object({
			path: Type.String({ description: 'Relative path to the file, e.g. "report.md"' }),
		}),
		execute: async (_toolCallId, params) => {
			const { path: relativePath } = params as { path: string };
			const resolved = resolveWorkspacePath(ctx.workspaceRoot, relativePath);

			// Reading any file inside skills/<name>/ counts as activating that
			// skill — feeds execution traces for the evolution engine.
			detectSkillRead(ctx, resolved);

			logger.debug({ path: relativePath }, '[agent-runner] read_file');

			const content = readFileSync(resolved, 'utf-8');
			const textContent: TextContent = { type: 'text', text: content };
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
