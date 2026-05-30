import type { Handle } from '@sveltejs/kit';
import { jwtVerify } from 'jose';
import type { AuthTokenPayload } from '@repo/types';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

/**
 * Server hook — runs on every incoming request.
 * Reads the accessToken cookie, verifies the JWT, and populates event.locals
 * so downstream load functions can access the authenticated user.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('accessToken');

	if (token) {
		try {
			const { payload } = await jwtVerify(token, JWT_SECRET);
			const authPayload = payload as AuthTokenPayload;
			// Map JWT payload to a minimal user shape for locals
			event.locals.user = {
				id: authPayload.sub!,
				email: authPayload.email,
				first_name: null,
				last_name: null,
				role: null,
				createdAt: new Date()
			};
			event.locals.accessToken = token;
		} catch {
			// Invalid or expired token — treat as unauthenticated
			event.locals.user = null;
			event.locals.accessToken = null;
		}
	} else {
		event.locals.user = null;
		event.locals.accessToken = null;
	}

	return resolve(event);
};
