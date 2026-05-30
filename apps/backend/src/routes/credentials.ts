import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadCredentialDefinitions, getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/encryptionService.js';
import { CredentialService } from '../services/credentialService.js';
import { CredentialResolverService } from '../services/credentialResolverService.js';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);
const resolverService = new CredentialResolverService(credentialService);

export const credentialsRouter = Router();

/**
 * GET /credentials/definitions
 * Returns all available credential definitions (from YAML registry).
 */
credentialsRouter.get('/definitions', (_req: Request, res: Response) => {
	const definitions = loadCredentialDefinitions();
	res.json({ success: true, data: definitions });
});

/**
 * GET /credentials/definitions/:id
 * Returns a single credential definition by its YAML id.
 */
credentialsRouter.get('/definitions/:id', (req: Request, res: Response) => {
	const id = req.params.id as string;
	const definition = getCredentialDefinition(id);
	if (!definition) {
		res.status(404).json({ success: false, error: 'Definition not found' });
		return;
	}
	res.json({ success: true, data: definition });
});

/**
 * GET /credentials
 * List all credential instances for a given owner.
 * Requires `ownerId` query parameter.
 */
credentialsRouter.get('/', async (req: Request, res: Response) => {
	const ownerId = req.query.ownerId as string | undefined;
	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
		return;
	}

	const list = await credentialService.listByOwner(ownerId);
	res.json({ success: true, data: list });
});

/**
 * GET /credentials/:id
 * Get a single credential's metadata (no decrypted data).
 * Requires `ownerId` query parameter.
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
credentialsRouter.get('/:id', async (req: Request, res: Response) => {
	const id = req.params.id as string;
	const ownerId = req.query.ownerId as string | undefined;
	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
		return;
	}

	const credential = await credentialService.getById(id, ownerId);
	if (!credential) {
		res.status(404).json({ success: false, error: 'Credential not found' });
		return;
	}
	res.json({ success: true, data: credential });
});

/**
 * POST /credentials
 * Create a new credential instance.
 * Body: { ownerId, name, type, data }
 */
credentialsRouter.post('/', async (req: Request, res: Response) => {
	const { ownerId, name, type, data } = req.body as {
		ownerId?: string;
		name?: string;
		type?: string;
		data?: Record<string, unknown>;
	};

	if (!ownerId || !name || !type || !data) {
		res.status(400).json({ success: false, error: 'ownerId, name, type, and data are required' });
		return;
	}

	// Validate that the type matches a known definition
	const definition = getCredentialDefinition(type);
	if (!definition) {
		res.status(400).json({ success: false, error: `Unknown credential type: ${type}` });
		return;
	}

	// Validate required properties
	const missingProps = definition.properties
		.filter((p) => p.required && !(p.name in data))
		.map((p) => p.displayName);

	if (missingProps.length > 0) {
		res.status(400).json({
			success: false,
			error: `Missing required properties: ${missingProps.join(', ')}`,
		});
		return;
	}

	const credential = await credentialService.create({ ownerId, name, type, data });
	res.status(201).json({ success: true, data: credential });
});

/**
 * PUT /credentials/:id
 * Update an existing credential (name and/or data).
 * Body: { ownerId, name?, data? }
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
credentialsRouter.put('/:id', async (req: Request, res: Response) => {
	const { ownerId, name, data } = req.body as {
		ownerId?: string;
		name?: string;
		data?: Record<string, unknown>;
	};

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId is required' });
		return;
	}

	if (!name && !data) {
		res.status(400).json({ success: false, error: 'At least one of name or data is required' });
		return;
	}

	const updateId = req.params.id as string;
	const updated = await credentialService.update(updateId, ownerId, { name, data });
	if (!updated) {
		res.status(404).json({ success: false, error: 'Credential not found' });
		return;
	}

	res.json({ success: true, data: updated });
});

/**
 * POST /credentials/:id/test
 * Validates a credential by executing the testRequest defined in the YAML definition.
 * Requires `ownerId` in the request body.
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
credentialsRouter.post('/:id/test', async (req: Request, res: Response) => {
	const testId = req.params.id as string;
	const { ownerId } = req.body as { ownerId?: string };

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId is required' });
		return;
	}

	const metadata = await credentialService.getById(testId, ownerId);
	if (!metadata) {
		res.status(404).json({ success: false, error: 'Credential not found' });
		return;
	}

	const definition = getCredentialDefinition(metadata.type);
	if (!definition) {
		res.status(400).json({ success: false, error: `Unknown credential type: ${metadata.type}` });
		return;
	}

	if (!definition.testRequest) {
		res
			.status(400)
			.json({ success: false, error: 'This credential type has no test request defined' });
		return;
	}

	// Resolve headers via the execution engine (handles OAuth refresh too)
	const resolved = await resolverService.resolve(testId, ownerId);

	const testResponse = await fetch(definition.testRequest.url, {
		method: definition.testRequest.method,
		headers: resolved.headers,
	});

	if (testResponse.ok) {
		res.json({ success: true, data: { valid: true, status: testResponse.status } });
	} else {
		res.json({
			success: false,
			error: `Test request failed with status ${testResponse.status}`,
			data: { valid: false, status: testResponse.status },
		});
	}
});

/**
 * DELETE /credentials/:id
 * Delete a credential by ID.
 * Body: { ownerId }
 * Returns 404 if the record does not exist or does not belong to the given owner.
 */
credentialsRouter.delete('/:id', async (req: Request, res: Response) => {
	const deleteId = req.params.id as string;
	const { ownerId } = req.body as { ownerId?: string };

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId is required' });
		return;
	}

	const deleted = await credentialService.delete(deleteId, ownerId);
	if (!deleted) {
		res.status(404).json({ success: false, error: 'Credential not found' });
		return;
	}
	res.json({ success: true, data: { deleted: true } });
});
