import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { ToolContext } from './types.js';

/**
 * trigger_workflow — Trigger an enabled workflow to start executing.
 *
 * Flow:
 *   1. Agent calls this tool with a workflowId and optional payload.
 *   2. The ProxyClient POSTs to /v1/runtime/internal/workflow/:workflowId/trigger.
 *   3. The host creates a workflow_run record, creates a thread, and spawns a
 *      new child process. Returns the runId immediately (fire-and-forget).
 *   4. The workflow executes asynchronously — no streaming back to this turn.
 *
 * Only enabled workflows belonging to this agent can be triggered.
 * Use list_workflows to discover available workflows and their IDs.
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — the sandbox
 * cannot trigger workflows belonging to other agents.
 */
export function createTriggerWorkflowTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'trigger_workflow',
		label: 'Trigger Workflow',
		description:
			'Start executing an enabled workflow asynchronously. ' +
			'Use this when the user asks you to run, start, or execute a workflow. ' +
			'Always call list_workflows first to confirm the correct workflowId — never guess an ID. ' +
			'The workflow runs as a separate process and returns immediately with a runId; ' +
			'it does NOT produce output in this chat turn. ' +
			'You can optionally pass a string key-value payload that is available to ' +
			'the workflow steps as {{trigger.payload}}. ' +
			'IMPORTANT: After this tool completes, your reply to the user MUST include ALL ' +
			'markdown links returned in the tool result exactly as they appear — do not omit or paraphrase them.',
		parameters: Type.Object({
			workflowId: Type.String({
				description: 'The ID of the workflow to trigger.',
			}),
			payload: Type.Optional(
				Type.Record(Type.String(), Type.String(), {
					description:
						'Optional string key-value data to pass to the workflow. ' +
						'Available in steps as {{trigger.payload}}. ' +
						'For example, pass dynamic parameters extracted from the conversation.',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { workflowId, payload } = params as {
				workflowId: string;
				payload?: Record<string, string>;
			};

			logger.info(
				{ workflowId, hasPayload: !!payload },
				'[agent-runner] trigger_workflow — triggering',
			);

			const result = await ctx.proxyClient.triggerWorkflow(workflowId, payload);

			logger.info({ workflowId, runId: result.runId }, '[agent-runner] trigger_workflow — started');

			// Build frontend links if agentId is available
			const agentId = ctx.agentId;
			const linksSection = agentId
				? `\n\n**Track this run:**\n` +
					`- [View run details](/app/agents/${agentId}/workflows/${workflowId}/runs/${result.runId})\n` +
					`- [View all runs for this workflow](/app/agents/${agentId}/workflows/${workflowId}/runs)\n` +
					`- [View all workflows](/app/agents/${agentId}/workflows)`
				: '';

			const textContent: TextContent = {
				type: 'text',
				text:
					`Workflow triggered successfully.\n` +
					`**Run ID:** \`${result.runId}\`\n` +
					`The workflow is now executing asynchronously.` +
					linksSection,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
