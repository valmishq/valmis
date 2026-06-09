import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, Workflow, WorkflowRun, WorkflowStepLog } from '@repo/types';

/**
 * Load the agent, workflow, run header, and step logs for a specific run.
 */
export const load: PageServerLoad = async (event) => {
	const { id: agentId, workflowId, runId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		error(401, 'Unauthorized');
	}

	const [agentRes, workflowRes, stepsRes] = await Promise.all([
		api(`/agents/${agentId}?ownerId=${encodeURIComponent(ownerId)}`, event),
		api(`/agents/${agentId}/workflows/${workflowId}`, event),
		api(`/agents/${agentId}/workflows/${workflowId}/runs/${runId}/steps`, event)
	]);

	if (!agentRes.ok) {
		error(404, 'Agent not found');
	}
	if (!workflowRes.ok) {
		error(404, 'Workflow not found');
	}

	const agent = (await agentRes.json()).data as Agent;
	const workflow = (await workflowRes.json()).data as Workflow;

	// Fetch the run header from the runs list (no single-run endpoint exists)
	const runsRes = await api(
		`/agents/${agentId}/workflows/${workflowId}/runs?limit=100&offset=0`,
		event
	);
	let run: WorkflowRun | null = null;
	if (runsRes.ok) {
		const runsBody = await runsRes.json();
		const runs = ((runsBody.data as { runs?: WorkflowRun[] })?.runs ?? []) as WorkflowRun[];
		run = runs.find((r) => r.id === runId) ?? null;
	}

	if (!run) {
		error(404, 'Run not found');
	}

	let stepLogs: WorkflowStepLog[] = [];
	if (stepsRes.ok) {
		const stepsBody = await stepsRes.json();
		stepLogs = (stepsBody.data ?? []) as WorkflowStepLog[];
		// Ensure ordering by stepIndex
		stepLogs.sort((a, b) => a.stepIndex - b.stepIndex);
	}

	return { agent, workflow, run, stepLogs };
};
