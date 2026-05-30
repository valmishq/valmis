import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { ApiKey } from '@repo/types';

/**
 * Load the current user's API keys for SSR.
 */
export const load: PageServerLoad = async (event) => {
	const res = await api('/api-keys', event);
	if (!res.ok) {
		return { keys: [] as ApiKey[] };
	}
	const body = await res.json();
	return { keys: (body.data ?? []) as ApiKey[] };
};
