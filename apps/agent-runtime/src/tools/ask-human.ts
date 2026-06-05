import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { ToolContext } from './types.js';

/**
 * ask_human — Pause agent execution and wait for a human operator to respond.
 *
 * When the agent calls this tool the following happens:
 *   1. The tool sends a POST to /v1/runtime/internal/hitl/request (long-poll).
 *   2. The backend emits a `hitl_request` SSE event so the browser unlocks the
 *      chat input and shows the agent's question.
 *   3. The HTTP request stays open until the human types a reply.
 *   4. The backend resolves the promise and returns { response } to this tool.
 *   5. Execution resumes with the human's answer as the tool result.
 *
 * Use cases:
 *   - Requesting approval before a high-risk action (e.g. deleting data, sending email)
 *   - Asking for clarification when instructions are ambiguous
 *   - Multi-step workflows that require human sign-off at specific checkpoints
 *
 * Security note: The HITL endpoint is covered by PROXY_TOKEN auth — only the
 * child process for this thread can call it.
 */
export function createAskHumanTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'ask_human',
		label: 'Ask Human',
		description:
			'Pause execution and ask a human operator a question or request approval. ' +
			'Execution is blocked until the human responds via the chat interface. ' +
			'Use this for high-risk actions, ambiguous instructions, or when human judgment is required.',
		parameters: Type.Object({
			prompt: Type.String({
				description:
					'The question or message to show the human operator. ' +
					'Be specific about what decision or information you need.',
			}),
			options: Type.Optional(
				Type.Array(Type.String(), {
					description:
						'Optional list of pre-defined choices to offer as buttons. ' +
						'Leave empty to allow any free-form response.',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { prompt, options } = params as { prompt: string; options?: string[] };

			logger.info(
				{ prompt, optionCount: options?.length ?? 0 },
				'[agent-runner] ask_human — waiting for human response',
			);

			const { response } = await ctx.proxyClient.hitlRequest({ prompt, options });

			logger.info(
				{ responseLength: response.length },
				'[agent-runner] ask_human — response received',
			);

			const textContent: TextContent = { type: 'text', text: response };
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
