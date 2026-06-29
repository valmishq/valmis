import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import type { Workflow, WorkflowNode, WorkflowEdge, FilterValue } from '@repo/types';
import type { ToolContext } from './types.js';

/** One-line summary of a Manual-mode filter (left op right, joined by and/or). */
function summarizeFilter(filter?: FilterValue): string {
	if (!filter || filter.conditions.length === 0) return '(no rules)';
	return filter.conditions
		.map((c) => `${c.left} ${c.operator}${c.right !== undefined ? ` ${c.right}` : ''}`.trim())
		.join(` ${filter.combinator} `);
}

/** Render a workflow's node/edge graph into a readable, flow-oriented description. */
function describeGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): string {
	const nameById = new Map<string, string>();
	for (const n of nodes) {
		nameById.set(n.id, n.type === 'trigger' ? 'Trigger' : n.data.name || n.type);
	}
	const label = (id: string) => nameById.get(id) ?? id;
	const targets = (sourceId: string, handle: string): string[] =>
		edges
			.filter((e) => e.source === sourceId && (e.sourceHandle ?? 'out') === handle)
			.map((e) => label(e.target));

	// Trace a loop's body chain (entry of the 'loop' handle, following 'out' until it loops back).
	const traceBody = (loopId: string): string[] => {
		const names: string[] = [];
		const seen = new Set<string>();
		let curr = edges.find((e) => e.source === loopId && (e.sourceHandle ?? '') === 'loop')?.target;
		while (curr && !seen.has(curr)) {
			seen.add(curr);
			names.push(label(curr));
			const back = edges.find((e) => e.source === curr && e.targetHandle === 'loopBack');
			if (back) break;
			const next = edges.find(
				(e) =>
					e.source === curr && (e.sourceHandle ?? 'out') === 'out' && e.targetHandle !== 'loopBack',
			);
			if (!next || next.target === loopId) break;
			curr = next.target;
		}
		return names;
	};

	const lines: string[] = [];
	const triggerNode = nodes.find((n) => n.type === 'trigger');
	if (triggerNode) {
		const entry = targets(triggerNode.id, 'out');
		lines.push(`Trigger → ${entry.join(', ') || '(nothing connected)'}`);
	}

	for (const n of nodes) {
		if (n.type === 'trigger') continue;
		if (n.type === 'agent') {
			const s = n.data;
			let line = `[Step] **${s.name || 'Untitled step'}**\n    Instruction: ${s.instruction}`;
			if (s.inputMapping) line += `\n    Input mapping: ${s.inputMapping}`;
			if (s.allTools) line += `\n    Tools: all`;
			else if (s.allowedTools.length > 0) line += `\n    Tools: ${s.allowedTools.join(', ')}`;
			if (s.allCredentials) line += `\n    Credentials: all assigned`;
			else if (s.allowedCredentialIds.length > 0)
				line += `\n    Credentials: ${s.allowedCredentialIds.join(', ')}`;
			if (s.expectedResponseSchema)
				line += `\n    Output schema: ${JSON.stringify(s.expectedResponseSchema)}`;
			line += `\n    On error: ${s.errorHandling.action}`;
			line += `\n    → ${targets(n.id, 'out').join(', ') || '(end)'}`;
			lines.push(line);
		} else if (n.type === 'condition') {
			const c = n.data;
			const mode = c.evalMode ?? (c.prompt ? 'smart' : 'manual');
			let line = `[Condition] **${c.name || 'Condition'}** (${mode === 'smart' ? 'Smart' : 'Manual'})`;
			line +=
				mode === 'smart'
					? `\n    Decides: ${c.prompt ?? '(no condition set)'}`
					: `\n    Rules: ${summarizeFilter(c.filter)}`;
			line += `\n    → true: ${targets(n.id, 'true').join(', ') || '(end)'}`;
			line += `\n    → false: ${targets(n.id, 'false').join(', ') || '(end)'}`;
			lines.push(line);
		} else if (n.type === 'loop') {
			const l = n.data;
			let line = `[Loop] **${l.name || 'Loop'}**`;
			if (l.mode === 'forEach') {
				line += `\n    For each item in: ${l.items ?? '(not set)'}`;
			} else {
				const mode = l.evalMode ?? (l.prompt ? 'smart' : 'manual');
				line += `\n    While (${mode === 'smart' ? 'Smart' : 'Manual'}): ${
					mode === 'smart' ? (l.prompt ?? '(no condition set)') : summarizeFilter(l.condition)
				}`;
			}
			line += `\n    Max iterations: ${l.maxIterations}`;
			line += `\n    Body: ${traceBody(n.id).join(' → ') || '(empty)'}`;
			line += `\n    When done → ${targets(n.id, 'done').join(', ') || '(end)'}`;
			lines.push(line);
		}
	}

	return lines.join('\n\n');
}

/**
 * read_workflow — Read the full definition of a workflow, including its node graph
 * (steps, conditions, loops) and how they connect.
 *
 * Security: agentId is derived from the PROXY_TOKEN on the host — the sandbox
 * cannot read workflows belonging to other agents.
 */
export function createReadWorkflowTool(ctx: ToolContext): AgentTool {
	const tool: AgentTool = {
		name: 'read_workflow',
		label: 'Read Workflow',
		description:
			'Read the full configuration of a specific workflow — its trigger and its node graph ' +
			'(agent steps, conditions/branches, and loops) including how nodes connect. ' +
			'Use list_workflows first to discover workflow IDs. ' +
			'Use this to understand exactly what a workflow does before triggering it, and what payload it expects.',
		parameters: Type.Object({
			workflowId: Type.String({ description: 'The ID of the workflow to read.' }),
		}),
		execute: async (_toolCallId, params) => {
			const { workflowId } = params as { workflowId: string };

			logger.info({ workflowId }, '[agent-runner] read_workflow — fetching');

			const workflow: Workflow = await ctx.proxyClient.readWorkflow(workflowId);

			logger.info(
				{ workflowId, nodeCount: workflow.nodes.length },
				'[agent-runner] read_workflow — received',
			);

			// Trigger summary
			const t = workflow.trigger;
			let triggerLine = 'Manual (fire on demand)';
			if (t?.kind === 'cron') {
				const cfg = t.config as { schedule?: string; timezone?: string };
				triggerLine = `Cron: \`${cfg.schedule ?? ''}\`${cfg.timezone ? ` (${cfg.timezone})` : ''}`;
			} else if (t?.kind === 'webhook') {
				triggerLine = 'Webhook (HTTP request)';
			} else if (t?.kind === 'app') {
				const cfg = t.config as { provider?: string; event?: string };
				triggerLine = `App event${cfg.provider ? ` — ${cfg.provider}${cfg.event ? `/${cfg.event}` : ''}` : ''}`;
			}

			const flow = describeGraph(workflow.nodes, workflow.edges);

			const textContent: TextContent = {
				type: 'text',
				text:
					`**${workflow.name}**` +
					(workflow.description ? `\n${workflow.description}` : '') +
					`\n**Trigger:** ${triggerLine}` +
					`\n\n**Flow:**\n\n${flow}`,
			};
			return { content: [textContent], details: {} };
		},
	};

	return tool;
}
