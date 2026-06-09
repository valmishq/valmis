import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { Workflow, WorkflowStep } from '@repo/types';
import type { ToolContext } from './types.js';

/**
 * read_workflow — Read the full definition of a workflow, including all steps.
 *
 * Flow:
 *   1. Agent calls this tool with the workflowId.
 *   2. The ProxyClient GETs /v1/runtime/internal/workflow/:workflowId.
 *   3. The host loads the workflow from DB, verifying it belongs to this agent.
 *   4. Returns the full step-by-step configuration.
 *
 * Use list_workflows first to discover available workflow IDs, then use this
 * to understand each step's instruction before deciding whether to trigger it.
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — the sandbox
 * cannot read workflows belonging to other agents.
 */
export function createReadWorkflowTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'read_workflow',
		label: 'Read Workflow',
		description:
			"Read the full configuration of a specific workflow, including every step's " +
			'name, instruction, allowed tools, and error handling settings. ' +
			'Use list_workflows first to discover available workflow IDs. ' +
			'Use this to understand exactly what a workflow does before triggering it — ' +
			"inspecting the steps helps you confirm the workflow matches the user's intent " +
			'and tells you what payload keys the steps expect.',
		parameters: Type.Object({
			workflowId: Type.String({
				description: 'The ID of the workflow to read.',
			}),
		}),
		execute: async (_toolCallId, params) => {
			const { workflowId } = params as { workflowId: string };

			logger.info({ workflowId }, '[agent-runner] read_workflow — fetching');

			const workflow: Workflow = await ctx.proxyClient.readWorkflow(workflowId);

			logger.info(
				{ workflowId, stepCount: workflow.steps.length },
				'[agent-runner] read_workflow — received',
			);

			// Format steps into human-readable text
			const stepsText = workflow.steps
				.map((step: WorkflowStep, idx: number) => {
					let stepStr =
						`  Step ${idx + 1}: **${step.name}**\n` + `    Instruction: ${step.instruction}`;

					if (step.inputMapping) {
						stepStr += `\n    Input mapping: ${step.inputMapping}`;
					}
					if (step.allowedTools.length > 0) {
						stepStr += `\n    Allowed tools: ${step.allowedTools.join(', ')}`;
					}
					if (step.allowedCredentialIds.length > 0) {
						stepStr += `\n    Credential IDs: ${step.allowedCredentialIds.join(', ')}`;
					}
					if (step.expectedResponseSchema) {
						stepStr += `\n    Expected JSON schema: ${JSON.stringify(step.expectedResponseSchema)}`;
					}
					stepStr += `\n    Error handling: ${step.errorHandling.action}`;
					return stepStr;
				})
				.join('\n\n');

			const textContent: TextContent = {
				type: 'text',
				text:
					`**${workflow.name}**` +
					(workflow.description ? `\n${workflow.description}` : '') +
					`\nSteps (${workflow.steps.length}):\n\n${stepsText}`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
