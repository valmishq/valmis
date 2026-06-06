import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { MemoryType } from '@repo/types';
import type { ToolContext } from './types.js';

/**
 * memory_search — Retrieve relevant memories by semantic similarity.
 *
 * Flow:
 *   1. Agent calls this tool with a query string.
 *   2. The ProxyClient POSTs to /v1/runtime/internal/memory/search.
 *   3. The host embeds the query text and performs a cosine similarity search
 *      against the agent's memory vectors in the DB (pgvector <=> operator).
 *   4. The top-K nearest entries are returned as formatted text.
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — this tool
 * can only search the memories of the current agent, never another agent.
 */
export function createMemorySearchTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'memory_search',
		label: 'Search Memory',
		description:
			'Search long-term memory for relevant information using semantic similarity. ' +
			'Returns the most relevant stored memories matching the query. ' +
			'Use this at the start of a task to recall past interactions, known facts, ' +
			'user preferences, or behavioral guidelines that may be relevant.',
		parameters: Type.Object({
			query: Type.String({
				description:
					'The search query. Describe what you are trying to recall. ' +
					'More specific queries return more relevant results.',
			}),
			memoryType: Type.Optional(
				Type.Union(
					[
						Type.Literal('episodic'),
						Type.Literal('semantic'),
						Type.Literal('procedural'),
						Type.Literal('working'),
					],
					{
						description:
							'Optional filter by memory type. If omitted, searches all types. ' +
							'Use "semantic" for facts, "procedural" for behavioral rules, ' +
							'"episodic" for past events, "working" for recent session context.',
					},
				),
			),
			topK: Type.Optional(
				Type.Number({
					description: 'Maximum number of results to return (1–20). Defaults to 5.',
					minimum: 1,
					maximum: 20,
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { query, memoryType, topK } = params as {
				query: string;
				memoryType?: MemoryType;
				topK?: number;
			};

			logger.info(
				{ memoryType, topK, queryLength: query.length },
				'[agent-runner] memory_search — querying',
			);

			const results = await ctx.proxyClient.memorySearch({
				query,
				memoryType,
				topK,
			});

			logger.info(
				{ resultCount: results.length, memoryType },
				'[agent-runner] memory_search — results received',
			);

			if (results.length === 0) {
				const textContent: TextContent = {
					type: 'text',
					text: 'No relevant memories found for this query.',
				};
				return { content: [textContent], details: {} };
			}

			// Format results as a readable list — each entry shows type, content, and recency
			const formatted = results
				.map((r, idx) => {
					const date = new Date(r.createdAt).toLocaleDateString();
					return `${idx + 1}. [${r.memoryType.toUpperCase()}] (${date})\n   ${r.content}`;
				})
				.join('\n\n');

			const textContent: TextContent = {
				type: 'text',
				text: `Found ${results.length} relevant memory entr${results.length === 1 ? 'y' : 'ies'}:\n\n${formatted}`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
