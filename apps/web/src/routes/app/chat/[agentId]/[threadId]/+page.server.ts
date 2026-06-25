import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type {
	Agent,
	AgentThread,
	AgentMessage,
	ChatFile,
	CredentialMetadata,
	CredentialDefinition
} from '@repo/types';
import { LLM_MODELS } from '@repo/models';

/**
 * Load agent, thread metadata, and initial message history.
 * Also resolves the model's context window length for the chat usage bar,
 * seeds the context token count from the thread's persisted contextTokens
 * column so the bar shows accurate data on reload, and builds a
 * credentialIconMap so ToolCallIndicator can resolve integration logos.
 */
export const load: PageServerLoad = async (event) => {
	const { agentId, threadId } = event.params;
	const ownerId = event.locals.user?.id;

	if (!ownerId) {
		throw error(401, 'Unauthorized');
	}

	const [agentRes, threadsRes, messagesRes, filesRes, credentialsRes, definitionsRes] =
		await Promise.all([
			api(`/agents/${agentId}`, event),
			api(`/runtime/${agentId}/threads`, event),
			api(`/runtime/${agentId}/threads/${threadId}/messages`, event),
			api(`/runtime/${agentId}/threads/${threadId}/files`, event),
			api('/credentials', event),
			api('/credentials/definitions', event)
		]);

	if (!agentRes.ok) {
		throw error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let threads: AgentThread[] = [];
	if (threadsRes.ok) {
		const threadsBody = await threadsRes.json();
		threads = (threadsBody.data ?? []) as AgentThread[];
	}

	// Find current thread metadata from the list
	const thread = threads.find((t) => t.id === threadId);
	if (!thread) {
		throw error(404, 'Thread not found');
	}

	let messages: AgentMessage[] = [];
	if (messagesRes.ok) {
		const messagesBody = await messagesRes.json();
		messages = (messagesBody.data ?? []) as AgentMessage[];
	}

	// Files attached to this thread (user uploads + agent-shared files).
	let threadFiles: ChatFile[] = [];
	if (filesRes.ok) {
		const filesBody = await filesRes.json();
		threadFiles = (filesBody.data ?? []) as ChatFile[];
	}

	// Build credentialId → { icon, integrationName } map.
	// 1. Build a definition lookup: definitionId → { icon, name } (from YAML definitions API)
	// 2. Map each credential.id → its definition's display metadata
	// This avoids maintaining a static logo map in frontend code — icons and names come directly
	// from the integration YAML definitions and update automatically when new integrations are added.
	const credentialMetaMap: Record<string, { icon: string | undefined; integrationName: string }> =
		{};
	if (credentialsRes.ok && definitionsRes.ok) {
		const credentialsBody = await credentialsRes.json();
		const credentials = (credentialsBody.data ?? []) as CredentialMetadata[];

		const definitionsBody = await definitionsRes.json();
		const definitions = (definitionsBody.data ?? []) as CredentialDefinition[];

		// Build definition id → { icon, name } lookup
		const definitionMetaMap: Record<string, { icon: string | undefined; brandName: string }> = {};
		for (const def of definitions) {
			definitionMetaMap[def.id] = { icon: def.icon, brandName: def.brandName || def.name };
		}

		// Map credential id → integration meta via credential.type === definition.id
		for (const cred of credentials) {
			const meta = definitionMetaMap[cred.type];
			if (meta) {
				credentialMetaMap[cred.id] = {
					icon: meta.icon,
					integrationName: meta.brandName
				};
			}
		}
	}

	// Resolve the model's context window from the catalog so the chat UI
	// can show "X / Y tokens" context fill bar.
	// Use exact match first, then fall back to bare model name (e.g. "gpt-4o"
	// → catalog entry "openai/gpt-4o") for agents configured without the prefix.
	let modelContextLength: number | null = null;
	// Whether the agent's model accepts image input — gates image attachment in the UI.
	let visionCapable = false;
	if (agent.modelConfigId) {
		const llmRes = await api(`/llm-providers/${agent.modelConfigId}`, event);
		if (llmRes.ok) {
			const llmBody = await llmRes.json();
			const modelId: string = llmBody.data?.model ?? '';
			const catalogEntry =
				LLM_MODELS.find((m) => m.id === modelId) ??
				LLM_MODELS.find((m) => m.id.endsWith('/' + modelId));
			modelContextLength = catalogEntry?.contextLength ?? null;
			visionCapable = (catalogEntry?.architecture?.inputModalities ?? []).includes('image');
		}
	}

	// Seed the context window token count from the thread's persisted contextTokens column.
	// This is an accumulated value: (input + output) added per turn.
	// Falls back to computing the sum from messages for threads created before this column
	// was added (contextTokens will be null on old rows).
	let threadContextTokens = thread.contextTokens ?? 0;
	if (threadContextTokens === 0) {
		// Legacy fallback: sum input+output across all assistant messages
		for (const msg of messages) {
			if (msg.role === 'assistant' && msg.tokenUsage) {
				threadContextTokens += msg.tokenUsage.input + msg.tokenUsage.output;
			}
		}
	}

	// Compute cumulative cost from persisted assistant messages.
	// This is a running total (not reset by compaction) and is used for the
	// cost display in the chat bar. Untouched by the contextTokens change.
	let threadTotalCost = 0;
	for (const msg of messages) {
		if (msg.role === 'assistant' && msg.tokenUsage) {
			threadTotalCost += msg.tokenUsage.cost.total;
		}
	}

	return {
		agent,
		/**
		 * Whether the browser-session menu/modal should be offered for this agent:
		 * the agent has internet access AND the project browser feature is on.
		 * UX gate only — the backend endpoints enforce it authoritatively.
		 */
		browserAvailable: agent.allowInternetAccess && env.BROWSER_FEATURE_ENABLED === 'true',
		thread,
		threads,
		messages,
		/** Files attached to this thread — rendered under their messages. */
		threadFiles,
		/** Whether the agent's model accepts image input (gates image upload in the UI). */
		visionCapable,
		modelContextLength,
		/**
		 * Current context window occupancy in tokens — sourced from thread.contextTokens
		 * (SET per turn, not accumulated). Seeds the ChatUsageBar on load.
		 * A future compaction feature will reduce this independently of threadTotalCost.
		 */
		threadContextTokens,
		/** Cumulative cost across all turns — seeded from all persisted assistant messages */
		threadTotalCost,
		/**
		 * Map of credentialId → { icon, integrationName }.
		 * icon: path from the YAML definition's icon field (e.g. /logos/github.svg), may be undefined.
		 * integrationName: human-readable integration name (e.g. "GitHub", "Slack").
		 * Used by ToolCallIndicator to show the integration logo and name for call_api tool calls.
		 * Built from the definitions API so it auto-updates when new integrations are added.
		 */
		credentialMetaMap
	};
};
