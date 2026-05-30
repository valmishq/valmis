import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { api } from '$lib/server/api';

/**
 * Root layout server load.
 * Checks auth status — redirects to /setup if no users exist yet,
 * redirects to /signin if setup is done but the path is /setup.
 * Passes user and accessToken to the layout for client-side store hydration.
 */
export const load: LayoutServerLoad = async (event) => {
	const res = await api('/auth/status', event);

	if (res.ok) {
		const body = await res.json();
		const needsSetup = body?.data?.needsSetup as boolean | undefined;

		if (needsSetup && event.url.pathname !== '/setup') {
			throw redirect(307, '/setup');
		}
		if (!needsSetup && event.url.pathname === '/setup') {
			throw redirect(307, '/signin');
		}
	}

	return {
		user: event.locals.user,
		accessToken: event.locals.accessToken
	};
};
