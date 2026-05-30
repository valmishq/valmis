import { Router } from 'express';
import type { Request, Response } from 'express';
import { UserService } from '../services/UserService.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	UsersListResponse,
	UserResponse,
	PasswordUpdateResponse,
	UserDeleteResponse,
	UpdateProfileRequestBody,
	ChangePasswordRequestBody,
	CreateUserRequestBody,
	UpdateUserRequestBody,
} from '@repo/types';

const userService = new UserService();

/**
 * Factory — creates the users router with an injected AuthService instance.
 *
 * Routes:
 *   GET    /v1/users              — list all users (requires read:users)
 *   GET    /v1/users/profile      — get own profile
 *   PATCH  /v1/users/profile      — update own profile
 *   POST   /v1/users/profile/password — change own password
 *   GET    /v1/users/:id          — get user by ID (requires read:users)
 *   POST   /v1/users              — create user (requires manage:all)
 *   PUT    /v1/users/:id          — update user (requires manage:all)
 *   DELETE /v1/users/:id          — delete user (requires manage:all)
 */
export function createUsersRouter(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/** GET /v1/users — list all users */
	router.get(
		'/',
		auth,
		requirePermission('read', 'users'),
		async (_req: Request, res: Response) => {
			const allUsers = await userService.findAll();
			const body: UsersListResponse = { success: true, data: allUsers };
			res.json(body);
		},
	);

	/** GET /v1/users/profile — get the authenticated user's own profile */
	router.get('/profile', auth, async (req: Request, res: Response) => {
		const userId = req.user!.sub!;
		const user = await userService.findById(userId);
		if (!user) {
			const body: UserResponse = { success: false, error: 'User not found' };
			res.status(404).json(body);
			return;
		}
		const body: UserResponse = { success: true, data: user };
		res.json(body);
	});

	/** PATCH /v1/users/profile — update own profile fields */
	router.patch('/profile', auth, async (req: Request, res: Response) => {
		const userId = req.user!.sub!;
		const { email, first_name, last_name } = req.body as UpdateProfileRequestBody;

		const ip = (req.ip ?? req.socket.remoteAddress) as string;
		const updated = await userService.updateUser(
			userId,
			{ email, first_name, last_name },
			undefined,
			userId,
			ip,
		);
		if (!updated) {
			const body: UserResponse = { success: false, error: 'User not found' };
			res.status(404).json(body);
			return;
		}
		const body: UserResponse = { success: true, data: updated };
		res.json(body);
	});

	/** POST /v1/users/profile/password — change own password */
	router.post('/profile/password', auth, async (req: Request, res: Response) => {
		const userId = req.user!.sub!;
		const { currentPassword, newPassword } = req.body as ChangePasswordRequestBody;

		if (!currentPassword || !newPassword) {
			const body: PasswordUpdateResponse = {
				success: false,
				error: 'currentPassword and newPassword are required',
			};
			res.status(400).json(body);
			return;
		}

		const ip = (req.ip ?? req.socket.remoteAddress) as string;
		const ok = await userService.updatePassword(userId, currentPassword, newPassword, userId, ip);
		if (!ok) {
			const body: PasswordUpdateResponse = {
				success: false,
				error: 'Current password is incorrect',
			};
			res.status(400).json(body);
			return;
		}
		const body: PasswordUpdateResponse = { success: true, data: { updated: true } };
		res.json(body);
	});

	/** GET /v1/users/:id — get a user by ID */
	router.get(
		'/:id',
		auth,
		requirePermission('read', 'users'),
		async (req: Request, res: Response) => {
			const user = await userService.findById(req.params.id as string);
			if (!user) {
				const body: UserResponse = { success: false, error: 'User not found' };
				res.status(404).json(body);
				return;
			}
			const body: UserResponse = { success: true, data: user };
			res.json(body);
		},
	);

	/** POST /v1/users — create a new user */
	router.post(
		'/',
		auth,
		requirePermission('manage', 'all'),
		async (req: Request, res: Response) => {
			const { email, first_name, last_name, password, roleId } = req.body as CreateUserRequestBody;

			if (!email || !password || !roleId) {
				const body: UserResponse = {
					success: false,
					error: 'email, password, and roleId are required',
				};
				res.status(400).json(body);
				return;
			}

			const ip = (req.ip ?? req.socket.remoteAddress) as string;
			const actor = req.user!.sub!;
			const user = await userService.createUser(
				{ email, first_name, last_name, password },
				roleId,
				actor,
				ip,
			);
			const body: UserResponse = { success: true, data: user };
			res.status(201).json(body);
		},
	);

	/** PUT /v1/users/:id — update a user */
	router.put(
		'/:id',
		auth,
		requirePermission('manage', 'all'),
		async (req: Request, res: Response) => {
			const { email, first_name, last_name, roleId } = req.body as UpdateUserRequestBody;

			const ip = (req.ip ?? req.socket.remoteAddress) as string;
			const actor = req.user!.sub!;
			const updated = await userService.updateUser(
				req.params.id as string,
				{ email, first_name, last_name },
				roleId,
				actor,
				ip,
			);

			if (!updated) {
				const body: UserResponse = { success: false, error: 'User not found' };
				res.status(404).json(body);
				return;
			}
			const body: UserResponse = { success: true, data: updated };
			res.json(body);
		},
	);

	/** DELETE /v1/users/:id — delete a user */
	router.delete(
		'/:id',
		auth,
		requirePermission('manage', 'all'),
		async (req: Request, res: Response) => {
			const ip = (req.ip ?? req.socket.remoteAddress) as string;
			const actor = req.user!.sub!;
			const result = await userService.deleteUser(req.params.id as string, actor, ip);
			if (result.error) {
				const body: UserDeleteResponse = { success: false, error: result.error };
				res.status(400).json(body);
				return;
			}
			const body: UserDeleteResponse = { success: true, data: { deleted: true } };
			res.json(body);
		},
	);

	return router;
}
