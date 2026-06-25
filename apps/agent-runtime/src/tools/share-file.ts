import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { existsSync } from 'fs';
import { logger } from '@repo/utils';
import { resolveWorkspacePath } from './types.js';
import type { ToolContext } from './types.js';

/**
 * share_file — Send a file from the agent's workspace to the user in the chat.
 *
 * The file is copied out of the workspace into the chat's file store and shown to
 * the user inline (images) or as a downloadable/previewable attachment (PDFs and
 * other files). Use this to deliver generated reports, exports, charts, etc.
 *
 * Path is relative to the workspace root; traversal is rejected.
 */
export function createShareFileTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'share_file',
		label: 'Share File',
		description:
			'Share a file from your workspace with the user in the chat. The user can ' +
			'view images inline and preview or download other files (e.g. PDFs, ' +
			'spreadsheets). Never attempt to send a link of the file to the user, because this may cause error. Just share the file itself as designed in this tool.',
		parameters: Type.Object({
			path: Type.String({
				description: 'Relative path to the file in your workspace, e.g. "output/report.pdf"',
			}),
		}),
		execute: async (_toolCallId, params) => {
			const { path: relativePath } = params as { path: string };
			// Validate containment locally for a clear error; the host re-checks.
			const resolved = resolveWorkspacePath(ctx.workspaceRoot, relativePath);
			if (!existsSync(resolved)) {
				const text: TextContent = {
					type: 'text',
					text: `Cannot share "${relativePath}": file does not exist in your workspace. Create it first.`,
				};
				return { content: [text], details: {}, isError: true };
			}

			logger.debug({ path: relativePath }, '[agent-runner] share_file');

			const file = await ctx.proxyClient.shareFile(relativePath);
			const text: TextContent = {
				type: 'text',
				text: `Shared "${file.name}" with the user.`,
			};
			return { content: [text], details: {} };
		},
	};

	return tool;
}
