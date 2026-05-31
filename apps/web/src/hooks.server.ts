import type { Handle } from '@sveltejs/kit';
import { jwtVerify } from 'jose';
import type { AuthTokenPayload } from '@repo/types';
import { JWT_SECRET as JWT_SECRET_ENV } from '$env/static/private';

// Use SvelteKit's env system so the root .env (env.dir = '../../') is respected.
// process.env is NOT populated from the root .env — only $env/static/private is.
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_ENV ?? '');

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
