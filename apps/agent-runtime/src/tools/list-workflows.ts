import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { WorkflowSummary } from '@repo/types';
import type { ToolContext } from './types.js';

/**
 * list_workflows — List all enabled workflows available to this agent.
 *
 * Flow:
 *   1. Agent calls this tool (no parameters needed).
 *   2. The ProxyClient GETs /v1/runtime/internal/workflow/list.
 *   3. The host queries the DB for all enabled workflows belonging to this agent.
 *   4. Returns a formatted summary list (id, name, description, step count).
 *
 * The agent can then use read_workflow to inspect a specific workflow's steps,
 * or trigger_workflow to start one.
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — this tool
 * can only list workflows owned by the current agent.
 */
export function createListWorkflowsTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'list_workflows',
		label: 'List Workflows',
		description:
			'List all enabled automation workflows available to this agent. ' +
			"Returns each workflow's ID, name, description, node composition (steps, conditions, loops), and trigger kind. " +
			'Use this to discover which workflows can be triggered. ' +
			"Use read_workflow to inspect a workflow's full graph (steps, branches, loops), " +
			'and trigger_workflow to execute one. ' +
			'Always call this first to get the correct workflowId before triggering or reading a specific workflow.',
		parameters: Type.Object({}),
		execute: async (_toolCallId, _params) => {
			logger.info('[agent-runner] list_workflows — fetching workflow list');

			const workflows: WorkflowSummary[] = await ctx.proxyClient.listWorkflows();

			logger.info({ count: workflows.length }, '[agent-runner] list_workflows — received');

			if (workflows.length === 0) {
				const textContent: TextContent = {
					type: 'text',
					text: 'No enabled workflows are configured for this agent.',
				};
				return { content: [textContent], details: {} };
			}

			const formatted = workflows
				.map((w: WorkflowSummary, idx: number) => {
					const composition =
						`${w.stepCount} step${w.stepCount === 1 ? '' : 's'}` +
						(w.conditionCount
							? `, ${w.conditionCount} condition${w.conditionCount === 1 ? '' : 's'}`
							: '') +
						(w.loopCount ? `, ${w.loopCount} loop${w.loopCount === 1 ? '' : 's'}` : '');
					return (
						`${idx + 1}. **${w.name}** (id: \`${w.id}\`)\n` +
						`   ${composition}` +
						(w.triggerKind ? ` · trigger: ${w.triggerKind}` : '') +
						(w.description ? `\n   ${w.description}` : '')
					);
				})
				.join('\n\n');

			const textContent: TextContent = {
				type: 'text',
				text: `Found ${workflows.length} enabled workflow${workflows.length === 1 ? '' : 's'}:\n\n${formatted}`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
