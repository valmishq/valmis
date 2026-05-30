import { Router } from 'express';
import type { Request, Response } from 'express';
import { IamService } from '../services/IamService.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	RolesListResponse,
	RoleResponse,
	RoleDeleteResponse,
	CreateRoleRequestBody,
	UpdateRoleRequestBody,
} from '@repo/types';

const iamService = new IamService();

/**
 * Factory — creates the IAM roles router with an injected AuthService instance.
 *
 * Routes:
 *   GET    /v1/iam/roles       — list all roles (requires read:roles)
 *   GET    /v1/iam/roles/:id   — get a role by ID (requires read:roles)
 *   POST   /v1/iam/roles       — create a role (requires manage:all)
 *   PUT    /v1/iam/roles/:id   — update a role (requires manage:all)
 *   DELETE /v1/iam/roles/:id   — delete a role (requires manage:all)
 */
export function createIamRouter(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/** GET /v1/iam/roles */
	router.get(
		'/roles',
		auth,
		requirePermission('read', 'roles'),
		async (_req: Request, res: Response) => {
			const allRoles = await iamService.getRoles();
			const body: RolesListResponse = { success: true, data: allRoles };
			res.json(body);
		},
	);

	/** GET /v1/iam/roles/:id */
	router.get(
		'/roles/:id',
		auth,
		requirePermission('read', 'roles'),
		async (req: Request, res: Response) => {
			const role = await iamService.getRoleById(req.params.id as string);
			if (!role) {
				const body: RoleResponse = { success: false, error: 'Role not found' };
				res.status(404).json(body);
				return;
			}
			const body: RoleResponse = { success: true, data: role };
			res.json(body);
		},
	);

	/** POST /v1/iam/roles */
	router.post(
		'/roles',
		auth,
		requirePermission('manage', 'all'),
		async (req: Request, res: Response) => {
			const { name, policies, slug } = req.body as CreateRoleRequestBody;

			if (!name || !policies) {
				const body: RoleResponse = {
					success: false,
					error: 'name and policies are required',
				};
				res.status(400).json(body);
				return;
			}

			const role = await iamService.createRole(name, policies, slug);
			const body: RoleResponse = { success: true, data: role };
			res.status(201).json(body);
		},
	);

	/** PUT /v1/iam/roles/:id */
	router.put(
		'/roles/:id',
		auth,
		requirePermission('manage', 'all'),
		async (req: Request, res: Response) => {
			const { name, policies } = req.body as UpdateRoleRequestBody;

			const updated = await iamService.updateRole(req.params.id as string, { name, policies });
			if (!updated) {
				const body: RoleResponse = { success: false, error: 'Role not found' };
				res.status(404).json(body);
				return;
			}
			const body: RoleResponse = { success: true, data: updated };
			res.json(body);
		},
	);

	/** DELETE /v1/iam/roles/:id */
	router.delete(
		'/roles/:id',
		auth,
		requirePermission('manage', 'all'),
		async (req: Request, res: Response) => {
			const deleted = await iamService.deleteRole(req.params.id as string);
			if (!deleted) {
				const body: RoleDeleteResponse = { success: false, error: 'Role not found' };
				res.status(404).json(body);
				return;
			}
			const body: RoleDeleteResponse = { success: true, data: { deleted: true } };
			res.json(body);
		},
	);

	return router;
}
