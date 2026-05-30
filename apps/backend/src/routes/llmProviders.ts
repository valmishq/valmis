import { Router } from 'express';
import type { Request, Response } from 'express';
import { EncryptionService } from '../services/encryptionService.js';
import { LlmProviderService } from '../services/llmProviderService.js';
import type { CreateLlmProviderConfigInput, UpdateLlmProviderConfigInput } from '@repo/types';

const encryption = new EncryptionService();
const llmProviderService = new LlmProviderService(encryption);

export const llmProvidersRouter = Router();

/**
 * GET /llm-providers
 * List all LLM provider configs for a given owner (metadata only — no secrets).
 * Requires `ownerId` query parameter.
 */
llmProvidersRouter.get('/', async (req: Request, res: Response) => {
	const ownerId = req.query.ownerId as string | undefined;
	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
		return;
	}

	const configs = await llmProviderService.listByOwner(ownerId);
	res.json({ success: true, data: configs });
});

/**
 * GET /llm-providers/:id
 * Get a single LLM provider config metadata by ID (no decrypted secret).
 * Requires `ownerId` query parameter.
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
llmProvidersRouter.get('/:id', async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const ownerId = req.query.ownerId as string | undefined;
	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
		return;
	}

	const config = await llmProviderService.getById(id, ownerId);
	if (!config) {
		res.status(404).json({ success: false, error: 'LLM provider config not found' });
		return;
	}
	res.json({ success: true, data: config });
});

/**
 * POST /llm-providers
 * Create a new LLM provider config.
 * Body: { ownerId, provider, name, model, isDefault?, data: { apiKey, baseUrl? } }
 */
llmProvidersRouter.post('/', async (req: Request, res: Response) => {
	const { ownerId, provider, name, model, isDefault, data } = req.body as {
		ownerId?: string;
		provider?: string;
		name?: string;
		model?: string;
		isDefault?: boolean;
		data?: { apiKey?: string; baseUrl?: string };
	};

	if (!ownerId || !provider || !name || !model || !data?.apiKey) {
		res.status(400).json({
			success: false,
			error: 'ownerId, provider, name, model, and data.apiKey are required',
		});
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
	res.status(201).json({ success: true, data: config });
});

/**
 * PUT /llm-providers/:id
 * Update an existing LLM provider config.
 * Body: { ownerId, name?, model?, isDefault?, data?: { apiKey, baseUrl? } }
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
llmProvidersRouter.put('/:id', async (req: Request, res: Response) => {
	const { ownerId, name, model, isDefault, data } = req.body as {
		ownerId?: string;
		name?: string;
		model?: string;
		isDefault?: boolean;
		data?: { apiKey?: string; baseUrl?: string };
	};

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId is required' });
		return;
	}

	if (name === undefined && model === undefined && isDefault === undefined && data === undefined) {
		res.status(400).json({
			success: false,
			error: 'At least one of name, model, isDefault, or data is required',
		});
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
		res.status(404).json({ success: false, error: 'LLM provider config not found' });
		return;
	}

	res.json({ success: true, data: updated });
});

/**
 * POST /llm-providers/:id/set-default
 * Mark a config as the default for its owner.
 * Body: { ownerId }
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
llmProvidersRouter.post('/:id/set-default', async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const { ownerId } = req.body as { ownerId?: string };

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId is required' });
		return;
	}

	const updated = await llmProviderService.setDefault(id, ownerId);
	if (!updated) {
		res.status(404).json({ success: false, error: 'LLM provider config not found' });
		return;
	}
	res.json({ success: true, data: updated });
});

/**
 * DELETE /llm-providers/:id
 * Delete an LLM provider config by ID.
 * Body: { ownerId }
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
llmProvidersRouter.delete('/:id', async (req: Request, res: Response) => {
	const deleteId = req.params.id as string;
	const { ownerId } = req.body as { ownerId?: string };

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId is required' });
		return;
	}

	const deleted = await llmProviderService.delete(deleteId, ownerId);
	if (!deleted) {
		res.status(404).json({ success: false, error: 'LLM provider config not found' });
		return;
	}
	res.json({ success: true, data: { deleted: true } });
});
