import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { api } from '$lib/server/api';
import type { Agent, Workflow, CredentialMetadata, CredentialDefinition } from '@repo/types';

/**
 * Unified load for workflow create and edit.
 *
 * URL params:
 *   ?workflowId=<id>&editmode=true  → edit mode: fetches the existing workflow
 *   (no params)                     → create mode
 */
export const load: PageServerLoad = async (event) => {
	const { id: agentId } = event.params;
	const ownerId = event.locals.user?.id;
	const workflowId = event.url.searchParams.get('workflowId');
	const isEditMode = event.url.searchParams.get('editmode') === 'true' && !!workflowId;

	if (!ownerId) {
		error(401, 'Not authenticated');
	}

	// Always need the agent + credentials + definitions in parallel
	const [agentRes, credsRes, defsRes] = await Promise.all([
		api(`/agents/${agentId}`, event),
		api('/credentials', event),
		api('/credentials/definitions', event)
	]);

	if (!agentRes.ok) {
		error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	let credentials: CredentialMetadata[] = [];
	if (credsRes.ok) {
		const credsBody = await credsRes.json();
		const allCredentials = (credsBody.data ?? []) as CredentialMetadata[];
		// Only expose credentials that are linked to this agent.
		// The step's allowedCredentialIds selector should only show agent-scoped credentials.
		const agentCredentialIds = new Set(agent.credentialIds);
		credentials = allCredentials.filter((c) => agentCredentialIds.has(c.id));
	}

	let definitions: CredentialDefinition[] = [];
	if (defsRes.ok) {
		const defsBody = await defsRes.json();
		definitions = (defsBody.data ?? []) as CredentialDefinition[];
	}

	// Edit mode: also fetch the existing workflow
	let workflow: Workflow | null = null;
	if (isEditMode && workflowId) {
		const workflowRes = await api(`/agents/${agentId}/workflows/${workflowId}`, event);
		if (!workflowRes.ok) {
			error(404, 'Workflow not found');
		}
		const workflowBody = await workflowRes.json();
		workflow = workflowBody.data as Workflow;
	}

	return { agent, credentials, definitions, workflow, isEditMode };
};

// ─── Form Actions ─────────────────────────────────────────────────────────────

export const actions: Actions = {
	/**
	 * Save action for both create and edit modes.
	 *
	 * Form fields:
	 *   - workflowId (present in edit mode)
	 *   - workflowJson: the full serialised workflow as a JSON string
	 */
	save: async (event) => {
		const ownerId = event.locals.user?.id;
		if (!ownerId) {
			return fail(401, { error: 'Not authenticated' });
		}

		const { id: agentId } = event.params;
		const formData = await event.request.formData();
		const workflowId = formData.get('workflowId') as string | null;
		const isEditMode = !!workflowId;
		const workflowJson = formData.get('workflowJson') as string | null;

		if (!workflowJson) {
			return fail(400, { error: 'Workflow data is missing.' });
		}

		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(workflowJson) as Record<string, unknown>;
		} catch {
			return fail(400, { error: 'Invalid workflow JSON.' });
		}

		if (isEditMode) {
			const res = await api(`/agents/${agentId}/workflows/${workflowId}`, event, {
				method: 'PUT',
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const body = await res.json();
				// Surface Zod issues if present
				if (body.issues) {
					const firstIssue = (body.issues as { message: string }[])[0];
					return fail(res.status, { error: firstIssue?.message ?? 'Validation failed' });
				}
				return fail(res.status, { error: body.error ?? 'Failed to update workflow' });
			}
		} else {
			const res = await api(`/agents/${agentId}/workflows`, event, {
				method: 'POST',
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const body = await res.json();
				if (body.issues) {
					const firstIssue = (body.issues as { message: string }[])[0];
					return fail(res.status, { error: firstIssue?.message ?? 'Validation failed' });
				}
				return fail(res.status, { error: body.error ?? 'Failed to create workflow' });
			}

			const body = await res.json();
			const newId = (body.data as Workflow).id;

			// Redirect to edit mode so user can keep editing
			redirect(
				303,
				`/app/agents/${agentId}/workflows/new?workflowId=${encodeURIComponent(newId)}&editmode=true&saved=true`
			);
		}

		// Edit-mode redirect
		redirect(
			303,
			`/app/agents/${agentId}/workflows/new?workflowId=${encodeURIComponent(workflowId!)}&editmode=true&saved=true`
		);
	}
};
