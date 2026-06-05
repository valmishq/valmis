import type { AgentTool } from '@earendil-works/pi-agent-core';
import { createCallApiTool } from './call-api.js';
import { createReadFileTool } from './read-file.js';
import { createWriteFileTool } from './write-file.js';
import { createListFilesTool } from './list-files.js';
import { createRunTerminalTool } from './run-terminal.js';
import { createAskHumanTool } from './ask-human.js';
import { createRunCodeTool } from './run-code.js';

export type { ToolContext } from './types.js';
export { resolveWorkspacePath } from './types.js';

/**
 * Build the full set of AgentTool instances for a single agent turn.
 *
 * To add a new tool:
 *   1. Create `src/tools/<your-tool>.ts` exporting `createYourTool(ctx)`
 *   2. Import and call it here
 *
 * All tools receive the same ToolContext — if a new tool needs extra
 * dependencies, add them to the ToolContext interface in `types.ts`.
 */
export function createAgentTools(ctx: Parameters<typeof createCallApiTool>[0]): AgentTool[] {
	return [
		createCallApiTool(ctx),
		createReadFileTool(ctx),
		createWriteFileTool(ctx),
		createListFilesTool(ctx),
		createRunTerminalTool(ctx),
		createAskHumanTool(ctx),
		createRunCodeTool(ctx),
	];
}
