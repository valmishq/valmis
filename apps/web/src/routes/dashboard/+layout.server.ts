import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Dashboard layout guard.
 * Any page nested under /dashboard requires an authenticated user.
 * Unauthenticated requests are redirected to /signin.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/signin');
	}
	return { user: locals.user };
};
