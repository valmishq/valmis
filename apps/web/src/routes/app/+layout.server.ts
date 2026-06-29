import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { api } from '$lib/server/api';
import type { User } from '@repo/types';

/**
 * Dashboard layout guard.
 * Any page nested under /app requires an authenticated user.
 * Unauthenticated requests are redirected to /signin.
 */
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/signin');
	}

	// locals.user is derived from the JWT, which only carries id/email/roles — it
	// has no first_name/last_name/role. Fetch the full record so the sidebar (and
	// any other layout consumer) shows real profile data. The request goes through
	// event.fetch, so invalidateAll() after a profile/email change refreshes it.
	try {
		const res = await api('/users/profile', event);
		const body = await res.json();
		if (body?.data) {
			return { user: body.data as Omit<User, 'password'> };
		}
	} catch {
		// Fall back to the minimal JWT-derived user if the profile fetch fails.
	}

	return { user: event.locals.user };
};
