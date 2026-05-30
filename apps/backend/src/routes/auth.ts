import { Router } from 'express';
import type { Request, Response } from 'express';
import { count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { UserService } from '../services/UserService.js';
import type { AuthService } from '../services/AuthService.js';
import type { AuthStatusResponse, SetupResponse, LoginApiResponse } from '@repo/types';

const userService = new UserService();

/**
 * Factory — creates the auth router with an injected AuthService instance.
 *
 * Routes:
 *   GET  /v1/auth/status  — returns { needsSetup: true } if no users exist (public)
 *   POST /v1/auth/setup   — creates the first admin user (blocked once a user exists)
 *   POST /v1/auth/login   — email/password login; returns { accessToken, user }
 */
export function createAuthRouter(authService: AuthService): Router {
	const router = Router();

	/**
	 * GET /v1/auth/status
	 * Public. Returns { needsSetup: boolean } so the frontend can redirect
	 * to /setup on fresh installations.
	 */
	router.get('/status', async (_req: Request, res: Response) => {
		const [{ value: userCount }] = await db.select({ value: count() }).from(users);
		const body: AuthStatusResponse = { success: true, data: { needsSetup: userCount === 0 } };
		res.json(body);
	});

	/**
	 * POST /v1/auth/setup
	 * Public, but blocked once the first user exists.
	 * Body: { email, password, first_name?, last_name? }
	 */
	router.post('/setup', async (req: Request, res: Response) => {
		const [{ value: userCount }] = await db.select({ value: count() }).from(users);
		if (userCount > 0) {
			const body: SetupResponse = { success: false, error: 'Setup already completed' };
			res.status(403).json(body);
			return;
		}

		const { email, password, first_name, last_name } = req.body as {
			email?: string;
			password?: string;
			first_name?: string;
			last_name?: string;
		};

		if (!email || !password) {
			const body: SetupResponse = { success: false, error: 'email and password are required' };
			res.status(400).json(body);
			return;
		}

		const user = await userService.createAdminUser({
			email,
			password,
			first_name,
			last_name,
		});

		const body: SetupResponse = { success: true, data: user! };
		res.status(201).json(body);
	});

	/**
	 * POST /v1/auth/login
	 * Body: { email, password }
	 * Returns: { accessToken, user }
	 */
	router.post('/login', async (req: Request, res: Response) => {
		const { email, password } = req.body as { email?: string; password?: string };

		if (!email || !password) {
			const body: LoginApiResponse = {
				success: false,
				error: 'email and password are required',
			};
			res.status(400).json(body);
			return;
		}

		const ip = (req.ip ?? req.socket.remoteAddress) as string;
		const result = await authService.login(email, password, ip);

		if (!result) {
			const body: LoginApiResponse = { success: false, error: 'Invalid credentials' };
			res.status(401).json(body);
			return;
		}

		const body: LoginApiResponse = { success: true, data: result };
		res.json(body);
	});

	return router;
}
