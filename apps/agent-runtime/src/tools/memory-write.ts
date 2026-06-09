import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { MemoryType } from '@repo/types';
import type { ToolContext } from './types.js';

/**
 * memory_write — Store a piece of information in long-term agent memory.
 *
 * Flow:
 *   1. Agent calls this tool with the text to remember and a memory type.
 *   2. The ProxyClient POSTs to /v1/runtime/internal/memory/write.
 *   3. The host generates an embedding vector (using the agent's embedding model)
 *      and persists the entry to the agent_memory table.
 *   4. The entry is available for future memory_search calls.
 *
 * Memory types:
 *   - episodic:   Raw records of what happened (conversation outcomes, task results)
 *   - semantic:   Distilled facts and long-term knowledge about users or domain
 *   - procedural: Behavioral rules, constraints, and patterns the agent has learned
 *   - working:    Short-lived context for the current session/task (thread-scoped)
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — this tool cannot
 * write memory entries for any other agent.
 */
export function createMemoryWriteTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'memory_write',
		label: 'Write Memory',
		description:
			'Store a piece of information in long-term agent memory for future retrieval. ' +
			'Use this to remember important facts, user preferences, task outcomes, or behavioral rules. ' +
			'Choose the memory type that best reflects the nature of the information: ' +
			'episodic (what happened), semantic (facts/knowledge), procedural (rules/behaviors), ' +
			'or working (temporary context for this session only).' +
			'Only memorize things that may be useful for future context, do not memorize trivial and insignificant details that does not have a long term impact.',
		parameters: Type.Object({
			content: Type.String({
				description: 'The text content to store in memory. Be specific and self-contained.',
			}),
			memoryType: Type.Union(
				[
					Type.Literal('episodic'),
					Type.Literal('semantic'),
					Type.Literal('procedural'),
					Type.Literal('working'),
				],
				{
					description:
						'Type of memory: ' +
						'"episodic" for event records, ' +
						'"semantic" for facts/knowledge, ' +
						'"procedural" for rules/behaviors, ' +
						'"working" for temporary session context.',
				},
			),
			metadata: Type.Optional(
				Type.String({
					description:
						'Optional JSON string with extra metadata (e.g. tags, source, confidence). ' +
						'Must be valid JSON if provided.',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { content, memoryType, metadata } = params as {
				content: string;
				memoryType: MemoryType;
				metadata?: string;
			};

			let parsedMetadata: Record<string, unknown> | undefined;
			if (metadata) {
				try {
					parsedMetadata = JSON.parse(metadata) as Record<string, unknown>;
				} catch {
					// Non-fatal — proceed without metadata if JSON is invalid
					logger.warn({ metadata }, '[memory_write] invalid metadata JSON — ignoring');
				}
			}

			logger.info(
				{ memoryType, contentLength: content.length },
				'[agent-runner] memory_write — storing entry',
			);

			const entry = await ctx.proxyClient.memoryWrite({
				content,
				memoryType,
				metadata: parsedMetadata,
			});

			logger.info(
				{ memoryId: entry.id, memoryType: entry.memoryType },
				'[agent-runner] memory_write — entry stored',
			);

			const textContent: TextContent = {
				type: 'text',
				text: `Memory stored successfully (id: ${entry.id}, type: ${entry.memoryType}).`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
