import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { Agent, AgentRunSummary } from '@repo/types';
import { LLM_MODELS } from '@repo/models';

/**
 * Load the agent and its run history (aggregated thread + token/cost stats).
 * Also resolves the model's context window length from the catalog for display.
 */
export const load: PageServerLoad = async (event) => {
	const { id: agentId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		throw error(401, 'Unauthorized');
	}

	const [agentRes, runsRes] = await Promise.all([
		api(`/agents/${agentId}?ownerId=${encodeURIComponent(ownerId)}`, event),
		api(`/agents/${agentId}/runs?ownerId=${encodeURIComponent(ownerId)}`, event)
	]);

	if (!agentRes.ok) {
		throw error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let runs: AgentRunSummary[] = [];
	if (runsRes.ok) {
		const runsBody = await runsRes.json();
		runs = (runsBody.data ?? []) as AgentRunSummary[];
	}

	// Resolve the model's context window from the catalog.
	// Falls back to null if the agent has no model or it's a custom/unknown entry.
	let modelContextLength: number | null = null;
	if (agent.modelConfigId) {
		const llmRes = await api(
			`/llm-providers/${agent.modelConfigId}?ownerId=${encodeURIComponent(ownerId)}`,
			event
		);
		if (llmRes.ok) {
			const llmBody = await llmRes.json();
			const modelId: string = llmBody.data?.model ?? '';
			const catalogEntry = LLM_MODELS.find((m) => m.id === modelId);
			modelContextLength = catalogEntry?.contextLength ?? null;
		}
	}

	return { agent, runs, modelContextLength };
};
