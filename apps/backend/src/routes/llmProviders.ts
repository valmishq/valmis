import { Router } from 'express';
import type { Request, Response } from 'express';
import { EncryptionService } from '../services/encryptionService.js';
import { LlmProviderService } from '../services/llmProviderService.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	CreateLlmProviderConfigInput,
	UpdateLlmProviderConfigInput,
	LlmProvidersListResponse,
	LlmProviderResponse,
	LlmProviderDeleteResponse,
} from '@repo/types';

const encryption = new EncryptionService();
const llmProviderService = new LlmProviderService(encryption);

/**
 * Factory — creates the LLM providers router with an injected AuthService instance.
 *
 * Routes:
 *   GET    /v1/llm-providers                   — list configs for an owner
 *   GET    /v1/llm-providers/:id               — get a single config
 *   POST   /v1/llm-providers                   — create a config
 *   PUT    /v1/llm-providers/:id               — update a config
 *   POST   /v1/llm-providers/:id/set-default   — set a config as default
 *   DELETE /v1/llm-providers/:id               — delete a config
 */
export function createLlmProvidersRouter(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * GET /v1/llm-providers
	 * List all LLM provider configs for a given owner (metadata only — no secrets).
	 * Requires `ownerId` query parameter.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.query.ownerId as string | undefined;
		if (!ownerId) {
			const body: LlmProvidersListResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
			return;
		}

		const configs = await llmProviderService.listByOwner(ownerId);
		const body: LlmProvidersListResponse = { success: true, data: configs };
		res.json(body);
	});

	/**
	 * GET /v1/llm-providers/:id
	 * Get a single LLM provider config metadata by ID (no decrypted secret).
	 * Requires `ownerId` query parameter.
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.get('/:id', auth, async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const ownerId = req.query.ownerId as string | undefined;
		if (!ownerId) {
			const body: LlmProviderResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
			return;
		}

		const config = await llmProviderService.getById(id, ownerId);
		if (!config) {
			const body: LlmProviderResponse = {
				success: false,
				error: 'LLM provider config not found',
			};
			res.status(404).json(body);
			return;
		}
		const body: LlmProviderResponse = { success: true, data: config };
		res.json(body);
	});

	/**
	 * POST /v1/llm-providers
	 * Create a new LLM provider config.
	 * Body: { ownerId, provider, name, model, isDefault?, data: { apiKey, baseUrl? } }
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const { ownerId, provider, name, model, isDefault, data } = req.body as {
			ownerId?: string;
			provider?: string;
			name?: string;
			model?: string;
			isDefault?: boolean;
			data?: { apiKey?: string; baseUrl?: string };
		};

		if (!ownerId || !provider || !name || !model || !data?.apiKey) {
			const body: LlmProviderResponse = {
				success: false,
				error: 'ownerId, provider, name, model, and data.apiKey are required',
			};
			res.status(400).json(body);
			return;
		}

		const input: CreateLlmProviderConfigInput = {
			ownerId,
			provider,
			name,
			model,
			isDefault: isDefault ?? false,
			data: { apiKey: data.apiKey, baseUrl: data.baseUrl },
		};

		const config = await llmProviderService.create(input);
		const body: LlmProviderResponse = { success: true, data: config };
		res.status(201).json(body);
	});

	/**
	 * PUT /v1/llm-providers/:id
	 * Update an existing LLM provider config.
	 * Body: { ownerId, name?, model?, isDefault?, data?: { apiKey, baseUrl? } }
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.put('/:id', auth, async (req: Request, res: Response) => {
		const { ownerId, name, model, isDefault, data } = req.body as {
			ownerId?: string;
			name?: string;
			model?: string;
			isDefault?: boolean;
			data?: { apiKey?: string; baseUrl?: string };
		};

		if (!ownerId) {
			const body: LlmProviderResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
			return;
		}

		if (
			name === undefined &&
			model === undefined &&
			isDefault === undefined &&
			data === undefined
		) {
			const body: LlmProviderResponse = {
				success: false,
				error: 'At least one of name, model, isDefault, or data is required',
			};
			res.status(400).json(body);
			return;
		}

		const input: UpdateLlmProviderConfigInput = { name, model, isDefault };

		// Only include data if apiKey is provided (required field in LlmProviderSecretData)
		if (data?.apiKey !== undefined) {
			input.data = { apiKey: data.apiKey, baseUrl: data.baseUrl };
		}

		const updateId = req.params.id as string;
		const updated = await llmProviderService.update(updateId, ownerId, input);
		if (!updated) {
			const body: LlmProviderResponse = {
				success: false,
				error: 'LLM provider config not found',
			};
			res.status(404).json(body);
			return;
		}

		const body: LlmProviderResponse = { success: true, data: updated };
		res.json(body);
	});

	/**
	 * POST /v1/llm-providers/:id/set-default
	 * Mark a config as the default for its owner.
	 * Body: { ownerId }
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.post('/:id/set-default', auth, async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const { ownerId } = req.body as { ownerId?: string };

		if (!ownerId) {
			const body: LlmProviderResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
			return;
		}

		const updated = await llmProviderService.setDefault(id, ownerId);
		if (!updated) {
			const body: LlmProviderResponse = {
				success: false,
				error: 'LLM provider config not found',
			};
			res.status(404).json(body);
			return;
		}
		const body: LlmProviderResponse = { success: true, data: updated };
		res.json(body);
	});

	/**
	 * DELETE /v1/llm-providers/:id
	 * Delete an LLM provider config by ID.
	 * Body: { ownerId }
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.delete('/:id', auth, async (req: Request, res: Response) => {
		const deleteId = req.params.id as string;
		const { ownerId } = req.body as { ownerId?: string };

		if (!ownerId) {
			const body: LlmProviderDeleteResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
			return;
		}

		const deleted = await llmProviderService.delete(deleteId, ownerId);
		if (!deleted) {
			const body: LlmProviderDeleteResponse = {
				success: false,
				error: 'LLM provider config not found',
			};
			res.status(404).json(body);
			return;
		}
		const body: LlmProviderDeleteResponse = { success: true, data: { deleted: true } };
		res.json(body);
	});

	return router;
}
