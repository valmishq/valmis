import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { Workflow } from '@repo/types';
import type { ToolContext } from './types.js';

/** Minimal step input accepted from the agent when creating a workflow. */
interface WorkflowStepInput {
	name: string;
	instruction: string;
	allowedTools?: string[];
	allowedCredentialIds?: string[];
	errorHandlingAction?: 'stop' | 'continue' | 'retry';
}

/** Trigger input accepted from the agent when creating a workflow. */
interface WorkflowTriggerInput {
	kind?: 'manual' | 'cron' | 'webhook';
	name?: string;
	/** For cron: { schedule: string, timezone?: string }. For webhook/manual: omit. */
	config?: Record<string, string>;
	description?: string;
}

/** Shape of the create workflow request sent to the host. */
interface CreateWorkflowInput {
	name: string;
	description?: string;
	steps: WorkflowStepInput[];
	trigger?: WorkflowTriggerInput;
}

/**
 * create_workflow — Create a new workflow for this agent.
 *
 * IMPORTANT: This tool must ONLY be called when the user has EXPLICITLY asked to
 * create a workflow. Before calling this tool, always:
 *   1. Design the workflow based on the user's description.
 *   2. Present the full configuration (name, description, steps, trigger) to the
 *      user for review using ask_human.
 *   3. Only call create_workflow after the user confirms the configuration.
 *
 * A trigger is always provisioned alongside the workflow.
 * Defaults to manual if none is specified.
 */
export function createCreateWorkflowTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'create_workflow',
		label: 'Create Workflow',
		description:
			'Create a new automation workflow for this agent with named steps, instructions, and a trigger. ' +
			'⚠️ RESTRICTED: Only call this when the user has EXPLICITLY asked to create a new workflow. ' +
			'BEFORE calling this tool you MUST complete ALL of the following steps: ' +
			'(1) Design the full workflow — choose a name, description, and write detailed instructions for each step. ' +
			'(2) Decide on the trigger type (manual / cron / webhook). For cron, explain the schedule in plain English to the user. ' +
			'(3) Present the complete configuration (all steps, trigger type and schedule) to the user in a readable format. ' +
			'(4) Use ask_human to get EXPLICIT confirmation — only proceed after the user says yes, confirm, or go ahead. ' +
			'Do NOT call this tool speculatively, without presenting the config first, or without ask_human confirmation. ' +
			'IMPORTANT: After this tool completes, your reply to the user MUST include ALL ' +
			'markdown links returned in the tool result exactly as they appear — do not omit or paraphrase them.',
		parameters: Type.Object({
			name: Type.String({
				description: 'The workflow name (short, descriptive).',
			}),
			description: Type.Optional(
				Type.String({
					description: 'A brief description of what this workflow does.',
				}),
			),
			steps: Type.Array(
				Type.Object({
					name: Type.String({ description: 'Step name.' }),
					instruction: Type.String({
						description:
							'The full task instruction for this step. Be detailed — this is what the agent will execute.',
					}),
					allowedTools: Type.Optional(
						Type.Array(Type.String(), {
							description:
								'Tool names allowed for this step. Leave empty to allow all tools. ' +
								'Available: call_api, read_file, write_file, list_files, run_terminal, run_code, ask_human, memory_write, memory_search.',
						}),
					),
					allowedCredentialIds: Type.Optional(
						Type.Array(Type.String(), {
							description:
								'Credential IDs allowed for this step (subset of agent credentials). Leave empty to allow all.',
						}),
					),
					errorHandlingAction: Type.Optional(
						Type.Union([Type.Literal('stop'), Type.Literal('continue'), Type.Literal('retry')], {
							description:
								"What to do if this step fails. 'stop' (default): halt the run. 'continue': skip and proceed. 'retry': try again.",
						}),
					),
				}),
				{ description: 'Ordered list of steps. The workflow executes them sequentially.' },
			),
			trigger: Type.Optional(
				Type.Object(
					{
						kind: Type.Optional(
							Type.Union([Type.Literal('manual'), Type.Literal('cron'), Type.Literal('webhook')], {
								description:
									"Trigger kind. 'manual': fire on demand. 'cron': scheduled. 'webhook': HTTP webhook. Defaults to 'manual'.",
							}),
						),
						name: Type.Optional(
							Type.String({
								description: 'Display name for this trigger. Defaults to the workflow name.',
							}),
						),
						config: Type.Optional(
							Type.Object(
								{
									schedule: Type.Optional(
										Type.String({
											description:
												"Cron expression (required when kind='cron'). E.g. '0 9 * * 1-5' = weekdays at 9am.",
										}),
									),
									timezone: Type.Optional(
										Type.String({
											description: "IANA timezone for cron scheduling. E.g. 'America/New_York'.",
										}),
									),
								},
								{
									description:
										'Trigger config. For cron: provide schedule (and optionally timezone). For manual/webhook: leave empty.',
								},
							),
						),
						description: Type.Optional(
							Type.String({ description: 'Optional description for the trigger.' }),
						),
					},
					{
						description:
							'Trigger to provision for this workflow. Defaults to a manual trigger if omitted.',
					},
				),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { name, description, steps, trigger } = params as {
				name: string;
				description?: string;
				steps: WorkflowStepInput[];
				trigger?: WorkflowTriggerInput;
			};

			logger.info(
				{ workflowName: name, stepCount: steps.length, triggerKind: trigger?.kind ?? 'manual' },
				'[agent-runner] create_workflow — creating',
			);

			const input: CreateWorkflowInput = { name, description, steps, trigger };
			const workflow: Workflow = await ctx.proxyClient.createWorkflow(input);

			logger.info(
				{ workflowId: workflow.id, workflowName: workflow.name },
				'[agent-runner] create_workflow — created',
			);

			// Build trigger summary for the response
			const t = workflow.trigger;
			let triggerSummary = 'Manual (fire on demand)';
			if (t?.kind === 'cron') {
				const cronConfig = t.config as { schedule?: string; timezone?: string };
				triggerSummary = `Cron: \`${cronConfig.schedule ?? ''}\`${cronConfig.timezone ? ` (${cronConfig.timezone})` : ''}`;
			} else if (t?.kind === 'webhook') {
				const webhookConfig = t.config as { secret?: string };
				triggerSummary = `Webhook — secret: \`${webhookConfig.secret ?? '(none)'}\``;
			}

			// Build frontend links if agentId is available
			const agentId = ctx.agentId;
			const linksSection = agentId
				? `\n\n**Manage this workflow:**\n` +
					`- [View & edit workflow](/app/agents/${agentId}/workflows/new?workflowId=${workflow.id}&editmode=true)\n` +
					`- [View all workflows](/app/workflows?agentId=${agentId})\n` +
					`- [View runs](/app/agents/${agentId}/workflows/${workflow.id}/runs)`
				: '';

			const textContent: TextContent = {
				type: 'text',
				text:
					`Workflow created successfully!\n` +
					`**Name:** ${workflow.name}\n` +
					`**ID:** \`${workflow.id}\`\n` +
					`**Steps:** ${workflow.steps.length}\n` +
					`**Trigger:** ${triggerSummary}\n` +
					`\nThe workflow is now saved and ready. ` +
					`Use \`trigger_workflow\` with id \`${workflow.id}\` to run it manually.` +
					linksSection,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
