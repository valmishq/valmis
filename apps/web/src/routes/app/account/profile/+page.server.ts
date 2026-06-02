import type { PageServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { User } from '@repo/types';

/**
 * Load the authenticated user's profile for SSR.
 */
export const load: PageServerLoad = async (event) => {
	const res = await api('/users/profile', event);
	if (!res.ok) {
		return { user: null as User | null };
	}
	const body = await res.json();
	return { user: (body.data ?? null) as User | null };
};
