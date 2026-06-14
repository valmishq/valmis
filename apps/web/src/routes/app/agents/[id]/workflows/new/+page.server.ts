import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { api } from '$lib/server/api';
import type {
	Agent,
	Workflow,
	CredentialMetadata,
	CredentialDefinition,
	AppTriggerProviderInfo
} from '@repo/types';

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

	// Always need the agent + credentials + definitions + app-trigger catalog in parallel
	const [agentRes, credsRes, defsRes, appTriggersRes] = await Promise.all([
		api(`/agents/${agentId}`, event),
		api('/credentials', event),
		api('/credentials/definitions', event),
		api('/app-triggers/providers', event)
	]);

	if (!agentRes.ok) {
		error(404, 'Agent not found');
	}

	const agentBody = await agentRes.json();
	const agent = agentBody.data as Agent;

	// All of the owner's credentials — app triggers authenticate the listener with any
	// credential of the matching type, not just agent-linked ones.
	let allCredentials: CredentialMetadata[] = [];
	if (credsRes.ok) {
		const credsBody = await credsRes.json();
		allCredentials = (credsBody.data ?? []) as CredentialMetadata[];
	}
	// Step cards only expose credentials linked to this agent (the agent's own authority).
	const agentCredentialIds = new Set(agent.credentialIds);
	const credentials = allCredentials.filter((c) => agentCredentialIds.has(c.id));

	let definitions: CredentialDefinition[] = [];
	if (defsRes.ok) {
		const defsBody = await defsRes.json();
		definitions = (defsBody.data ?? []) as CredentialDefinition[];
	}

	let appTriggerProviders: AppTriggerProviderInfo[] = [];
	if (appTriggersRes.ok) {
		const appBody = await appTriggersRes.json();
		appTriggerProviders = (appBody.data ?? []) as AppTriggerProviderInfo[];
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

	return {
		agent,
		credentials,
		allCredentials,
		definitions,
		appTriggerProviders,
		workflow,
		isEditMode
	};
};

/**
 * Pull a flat list of human-readable validation messages from a 422 error body.
 * Prefers the backend's path-annotated `messages`, falls back to raw Zod `issues`.
 */
function extractMessages(body: unknown): string[] {
	const b = body as { messages?: unknown; issues?: { path?: string; message?: string }[] };
	if (Array.isArray(b.messages)) {
		return b.messages.filter((m): m is string => typeof m === 'string');
	}
	if (Array.isArray(b.issues)) {
		return b.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : (i.message ?? 'Invalid value')));
	}
	return [];
}

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
				// Surface ALL validation problems (path-annotated) so the user can fix them.
				const messages = extractMessages(body);
				if (messages.length > 0) {
					return fail(res.status, { error: messages.join('\n'), messages });
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
				const messages = extractMessages(body);
				if (messages.length > 0) {
					return fail(res.status, { error: messages.join('\n'), messages });
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
