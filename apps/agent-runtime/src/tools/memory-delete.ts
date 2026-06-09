import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { ToolContext } from './types.js';

/**
 * memory_delete — Delete one or more memory entries from long-term agent memory.
 *
 * Flow:
 *   1. Agent calls this tool with one or more memory IDs (obtained via memory_search).
 *   2. The ProxyClient POSTs to /v1/runtime/internal/memory/delete.
 *   3. The host deletes the matching entries from the agent_memory table.
 *      The agentId guard ensures the sandbox can only delete its own agent's memory.
 *
 * Common use cases:
 *   - Removing outdated facts that are no longer accurate.
 *   - Correcting a previously stored preference the user has changed.
 *   - Cleaning up duplicate or stale episodic entries.
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — this tool
 * cannot delete memory entries belonging to any other agent.
 */
export function createMemoryDeleteTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'memory_delete',
		label: 'Delete Memory',
		description:
			'Delete one or more memory entries from long-term agent memory by their IDs. ' +
			'Use this to remove outdated facts, stale preferences, or incorrect information. ' +
			'Memory IDs can be obtained from the results of memory_search. ' +
			'You may delete multiple entries in a single call by providing an array of IDs.',
		parameters: Type.Object({
			memoryIds: Type.Array(Type.String({ description: 'UUID of the memory entry to delete.' }), {
				description:
					'One or more memory entry IDs to delete. ' +
					'Pass a single-element array to delete one entry, ' +
					'or multiple IDs to delete in bulk.',
				minItems: 1,
				maxItems: 100,
			}),
		}),
		execute: async (_toolCallId, params) => {
			const { memoryIds } = params as { memoryIds: string[] };

			if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
				const textContent: TextContent = {
					type: 'text',
					text: 'Error: memoryIds must be a non-empty array.',
				};
				return { content: [textContent], details: {} };
			}

			logger.info({ count: memoryIds.length }, '[agent-runner] memory_delete — deleting entries');

			const result = await ctx.proxyClient.memoryDelete({ memoryIds });

			logger.info(
				{ requested: memoryIds.length, deleted: result.deletedCount },
				'[agent-runner] memory_delete — complete',
			);

			const notFound = memoryIds.length - result.deletedCount;
			const textContent: TextContent = {
				type: 'text',
				text:
					result.deletedCount === 0
						? 'No memory entries were deleted. The provided IDs may not exist or may belong to a different agent.'
						: notFound > 0
							? `Deleted ${result.deletedCount} memory entr${result.deletedCount === 1 ? 'y' : 'ies'}. ${notFound} ID${notFound === 1 ? ' was' : 's were'} not found.`
							: `Successfully deleted ${result.deletedCount} memory entr${result.deletedCount === 1 ? 'y' : 'ies'}.`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
