import { Router } from 'express';
import type { Request, Response } from 'express';
import { ApiKeyService } from '../services/ApiKeyService.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	ApiKeyCreateResponse,
	ApiKeysListResponse,
	ApiKeyDeleteResponse,
	CreateApiKeyRequestBody,
} from '@repo/types';

/**
 * Factory — creates the API keys router with an injected AuthService instance.
 *
 * Routes:
 *   POST   /v1/api-keys       — generate a new API key for the authenticated user
 *   GET    /v1/api-keys       — list all API keys (masked) for the authenticated user
 *   DELETE /v1/api-keys/:id   — delete an API key owned by the authenticated user
 */
export function createApiKeysRouter(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * POST /v1/api-keys
	 * Body: { name, expiresInDays }
	 * Returns the raw key once — store it immediately as it is not retrievable later.
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const { name, expiresInDays } = req.body as CreateApiKeyRequestBody;

		if (!name || !expiresInDays) {
			const body: ApiKeyCreateResponse = {
				success: false,
				error: 'name and expiresInDays are required',
			};
			res.status(400).json(body);
			return;
		}

		const userId = req.user!.sub!;
		const ip = (req.ip ?? req.socket.remoteAddress) as string;

		const rawKey = await ApiKeyService.generate(userId, name, expiresInDays, userId, ip);
		const body: ApiKeyCreateResponse = { success: true, data: { key: rawKey } };
		res.status(201).json(body);
	});

	/** GET /v1/api-keys — list masked API keys for the authenticated user */
	router.get('/', auth, async (req: Request, res: Response) => {
		const userId = req.user!.sub!;
		const keys = await ApiKeyService.getKeys(userId);
		const body: ApiKeysListResponse = { success: true, data: keys };
		res.json(body);
	});

	/** DELETE /v1/api-keys/:id — delete an API key owned by the authenticated user */
	router.delete('/:id', auth, async (req: Request, res: Response) => {
		const userId = req.user!.sub!;
		const ip = (req.ip ?? req.socket.remoteAddress) as string;

		const deleted = await ApiKeyService.deleteKey(req.params.id as string, userId, userId, ip);
		if (!deleted) {
			const body: ApiKeyDeleteResponse = { success: false, error: 'API key not found' };
			res.status(404).json(body);
			return;
		}
		const body: ApiKeyDeleteResponse = { success: true, data: { deleted: true } };
		res.json(body);
	});

	return router;
}
