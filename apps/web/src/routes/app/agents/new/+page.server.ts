import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { api } from '$lib/server/api';
import { error } from '@sveltejs/kit';
import type {
	Agent,
	AgentEvolvedSkill,
	CredentialMetadata,
	CredentialDefinition,
	LlmProviderConfig
} from '@repo/types';

/**
 * Unified load function for both create and edit modes.
 *
 * URL params:
 *   ?id=<agentId>&editmode=true  → edit mode: fetches existing agent data
 *   (no params)                  → create mode: fetches supporting data only
 */
export const load: PageServerLoad = async (event) => {
	const ownerId = event.locals.user?.id;
	const agentId = event.url.searchParams.get('id');
	const isEditMode = event.url.searchParams.get('editmode') === 'true' && !!agentId;

	if (!ownerId) {
		error(401, 'Not authenticated');
	}

	// Always fetch supporting data in parallel
	// Note: skill catalog is NOT loaded here — the AgentSkillsPanel component
	// fetches it lazily when the "Add skill" dialog is opened.
	const [credsRes, defsRes, llmRes] = await Promise.all([
		api('/credentials', event),
		api('/credentials/definitions', event),
		api('/llm-providers', event)
	]);

	let credentials: CredentialMetadata[] = [];
	if (credsRes.ok) {
		const body = await credsRes.json();
		credentials = (body.data ?? []) as CredentialMetadata[];
	}

	let definitions: CredentialDefinition[] = [];
	if (defsRes.ok) {
		const body = await defsRes.json();
		definitions = (body.data ?? []) as CredentialDefinition[];
	}

	let llmConfigs: LlmProviderConfig[] = [];
	if (llmRes.ok) {
		const body = await llmRes.json();
		llmConfigs = (body.data ?? []) as LlmProviderConfig[];
	}

	// Edit mode — additionally fetch agent, assigned skills, and evolved skills
	let agent: Agent | null = null;
	let assignedSkillNames: string[] = [];
	const evolvedSkills: Record<string, AgentEvolvedSkill> = {};

	if (isEditMode) {
		const [agentRes, agentSkillsRes, evolvedRes] = await Promise.all([
			api(`/agents/${agentId}`, event),
			api(`/agents/${agentId}/skills`, event),
			api(`/agents/${agentId}/skills/evolved`, event)
		]);

		if (!agentRes.ok) {
			error(404, 'Agent not found');
		}

		const agentBody = await agentRes.json();
		agent = agentBody.data as Agent;

		if (agentSkillsRes.ok) {
			const body = await agentSkillsRes.json();
			assignedSkillNames = (body.data ?? []) as string[];
		}

		if (evolvedRes.ok) {
			const body = await evolvedRes.json();
			for (const evolved of (body.data ?? []) as AgentEvolvedSkill[]) {
				evolvedSkills[evolved.skillName] = evolved;
			}
		}
	}

	return {
		isEditMode,
		agent,
		credentials,
		definitions,
		llmConfigs,
		assignedSkillNames,
		evolvedSkills
	};
};

// ─── Form Actions ─────────────────────────────────────────────────────────────

export const actions: Actions = {
	/**
	 * Unified save action for both create and edit modes.
	 *
	 * Form fields:
	 *   - name, description, systemInstruction, avatarUrl
	 *   - modelConfigId, embeddingModelConfigId
	 *   - credentialIds (repeated field, one per selected credential)
	 *   - skillNames (repeated field, one per selected skill)
	 *   - agentId (present in edit mode only)
	 *
	 * Two-step process:
	 *   1. Create or update the agent to get a stable agentId
	 *   2. Sync skill assignments: remove skills not in the new list, add new ones
	 */
	save: async (event) => {
		const ownerId = event.locals.user?.id;
		if (!ownerId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const formData = await event.request.formData();

		const agentId = formData.get('agentId') as string | null;
		const isEditMode = !!agentId;

		const name = (formData.get('name') as string | null)?.trim();
		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		const description = (formData.get('description') as string | null)?.trim() || null;
		const systemInstruction = (formData.get('systemInstruction') as string | null)?.trim() || null;
		const avatarUrl = (formData.get('avatarUrl') as string | null) || '🤖';
		const modelConfigId = (formData.get('modelConfigId') as string | null) || null;
		const embeddingModelConfigId =
			(formData.get('embeddingModelConfigId') as string | null) || null;
		const credentialIds = formData.getAll('credentialIds') as string[];
		const skillNames = formData.getAll('skillNames') as string[];
		const allowInternetAccess = formData.get('allowInternetAccess') !== 'false';

		// Step 1: Create or update agent
		let savedAgentId: string;
		if (isEditMode) {
			const res = await api(`/agents/${agentId}`, event, {
				method: 'PUT',
				body: JSON.stringify({
					name,
					description,
					systemInstruction,
					avatarUrl,
					credentialIds,
					modelConfigId,
					embeddingModelConfigId,
					allowInternetAccess
				})
			});

			if (!res.ok) {
				const body = await res.json();
				return fail(res.status, { error: body.error ?? 'Failed to update agent' });
			}

			savedAgentId = agentId;
		} else {
			const res = await api('/agents', event, {
				method: 'POST',
				body: JSON.stringify({
					name,
					description,
					systemInstruction,
					avatarUrl,
					credentialIds,
					modelConfigId,
					embeddingModelConfigId,
					allowInternetAccess
				})
			});

			if (!res.ok) {
				const body = await res.json();
				return fail(res.status, { error: body.error ?? 'Failed to create agent' });
			}

			const body = await res.json();
			savedAgentId = (body.data as Agent).id;
		}

		// Step 2: Sync skill assignments
		// Fetch currently assigned skills so we can diff
		const currentSkillsRes = await api(`/agents/${savedAgentId}/skills`, event);
		const currentSkills: string[] = currentSkillsRes.ok
			? ((await currentSkillsRes.json()).data ?? [])
			: [];

		const toAdd = skillNames.filter((s) => !currentSkills.includes(s));
		const toRemove = currentSkills.filter((s) => !skillNames.includes(s));

		// Execute adds and removes in parallel — best-effort (don't fail the whole action on skill errors)
		await Promise.allSettled([
			...toAdd.map((skillName) =>
				api(`/agents/${savedAgentId}/skills`, event, {
					method: 'POST',
					body: JSON.stringify({ skillName })
				})
			),
			...toRemove.map((skillName) =>
				api(`/agents/${savedAgentId}/skills/${encodeURIComponent(skillName)}`, event, {
					method: 'DELETE'
				})
			)
		]);

		// Redirect to edit mode of the saved agent so the user can see the result
		redirect(
			303,
			`/app/agents/new?id=${encodeURIComponent(savedAgentId)}&editmode=true&saved=true`
		);
	}
};
