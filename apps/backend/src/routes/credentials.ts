import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadCredentialDefinitions, getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/encryptionService.js';
import { CredentialService } from '../services/credentialService.js';
import { CredentialResolverService } from '../services/credentialResolverService.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	CredentialDefinitionsResponse,
	CredentialDefinitionResponse,
	CredentialsListResponse,
	CredentialResponse,
	CredentialDeleteResponse,
	CredentialTestResponse,
} from '@repo/types';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);
const resolverService = new CredentialResolverService(credentialService);

/**
 * Factory — creates the credentials router with an injected AuthService instance.
 *
 * Routes:
 *   GET    /v1/credentials/definitions       — list all credential definitions (public YAML registry)
 *   GET    /v1/credentials/definitions/:id   — get a single credential definition
 *   GET    /v1/credentials                   — list credentials for an owner
 *   GET    /v1/credentials/:id               — get a single credential's metadata
 *   POST   /v1/credentials                   — create a new credential
 *   PUT    /v1/credentials/:id               — update a credential
 *   POST   /v1/credentials/:id/test          — test a credential
 *   DELETE /v1/credentials/:id               — delete a credential
 */
export function createCredentialsRouter(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * GET /v1/credentials/definitions
	 * Returns all available credential definitions (from YAML registry).
	 */
	router.get('/definitions', auth, (_req: Request, res: Response) => {
		const definitions = loadCredentialDefinitions();
		const body: CredentialDefinitionsResponse = { success: true, data: definitions };
		res.json(body);
	});

	/**
	 * GET /v1/credentials/definitions/:id
	 * Returns a single credential definition by its YAML id.
	 */
	router.get('/definitions/:id', auth, (req: Request, res: Response) => {
		const id = req.params.id as string;
		const definition = getCredentialDefinition(id);
		if (!definition) {
			const body: CredentialDefinitionResponse = {
				success: false,
				error: 'Definition not found',
			};
			res.status(404).json(body);
			return;
		}
		const body: CredentialDefinitionResponse = { success: true, data: definition };
		res.json(body);
	});

	/**
	 * GET /v1/credentials
	 * List all credential instances for a given owner.
	 * Requires `ownerId` query parameter.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.query.ownerId as string | undefined;
		if (!ownerId) {
			const body: CredentialsListResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
			return;
		}

		const list = await credentialService.listByOwner(ownerId);
		const body: CredentialsListResponse = { success: true, data: list };
		res.json(body);
	});

	/**
	 * GET /v1/credentials/:id
	 * Get a single credential's metadata (no decrypted data).
	 * Requires `ownerId` query parameter.
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.get('/:id', auth, async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const ownerId = req.query.ownerId as string | undefined;
		if (!ownerId) {
			const body: CredentialResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
			return;
		}

		const credential = await credentialService.getById(id, ownerId);
		if (!credential) {
			const body: CredentialResponse = { success: false, error: 'Credential not found' };
			res.status(404).json(body);
			return;
		}
		const body: CredentialResponse = { success: true, data: credential };
		res.json(body);
	});

	/**
	 * POST /v1/credentials
	 * Create a new credential instance.
	 * Body: { ownerId, name, type, data }
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const { ownerId, name, type, data } = req.body as {
			ownerId?: string;
			name?: string;
			type?: string;
			data?: Record<string, unknown>;
		};

		if (!ownerId || !name || !type || !data) {
			const body: CredentialResponse = {
				success: false,
				error: 'ownerId, name, type, and data are required',
			};
			res.status(400).json(body);
			return;
		}

		// Validate that the type matches a known definition
		const definition = getCredentialDefinition(type);
		if (!definition) {
			const body: CredentialResponse = {
				success: false,
				error: `Unknown credential type: ${type}`,
			};
			res.status(400).json(body);
			return;
		}

		// Validate required properties
		const missingProps = definition.properties
			.filter((p) => p.required && !(p.name in data))
			.map((p) => p.displayName);

		if (missingProps.length > 0) {
			const body: CredentialResponse = {
				success: false,
				error: `Missing required properties: ${missingProps.join(', ')}`,
			};
			res.status(400).json(body);
			return;
		}

		const credential = await credentialService.create({ ownerId, name, type, data });
		const body: CredentialResponse = { success: true, data: credential };
		res.status(201).json(body);
	});

	/**
	 * PUT /v1/credentials/:id
	 * Update an existing credential (name and/or data).
	 * Body: { ownerId, name?, data? }
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.put('/:id', auth, async (req: Request, res: Response) => {
		const { ownerId, name, data } = req.body as {
			ownerId?: string;
			name?: string;
			data?: Record<string, unknown>;
		};

		if (!ownerId) {
			const body: CredentialResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
			return;
		}

		if (!name && !data) {
			const body: CredentialResponse = {
				success: false,
				error: 'At least one of name or data is required',
			};
			res.status(400).json(body);
			return;
		}

		const updateId = req.params.id as string;
		const updated = await credentialService.update(updateId, ownerId, { name, data });
		if (!updated) {
			const body: CredentialResponse = { success: false, error: 'Credential not found' };
			res.status(404).json(body);
			return;
		}

		const body: CredentialResponse = { success: true, data: updated };
		res.json(body);
	});

	/**
	 * POST /v1/credentials/:id/test
	 * Validates a credential by executing the testRequest defined in the YAML definition.
	 * Requires `ownerId` in the request body.
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.post('/:id/test', auth, async (req: Request, res: Response) => {
		const testId = req.params.id as string;
		const { ownerId } = req.body as { ownerId?: string };

		if (!ownerId) {
			const body: CredentialTestResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
			return;
		}

		const metadata = await credentialService.getById(testId, ownerId);
		if (!metadata) {
			const body: CredentialTestResponse = { success: false, error: 'Credential not found' };
			res.status(404).json(body);
			return;
		}

		const definition = getCredentialDefinition(metadata.type);
		if (!definition) {
			const body: CredentialTestResponse = {
				success: false,
				error: `Unknown credential type: ${metadata.type}`,
			};
			res.status(400).json(body);
			return;
		}

		if (!definition.testRequest) {
			const body: CredentialTestResponse = {
				success: false,
				error: 'This credential type has no test request defined',
			};
			res.status(400).json(body);
			return;
		}

		// Resolve headers via the execution engine (handles OAuth refresh too)
		const resolved = await resolverService.resolve(testId, ownerId);

		const testResponse = await fetch(definition.testRequest.url, {
			method: definition.testRequest.method,
			headers: resolved.headers,
		});

		if (testResponse.ok) {
			const body: CredentialTestResponse = {
				success: true,
				data: { valid: true, status: testResponse.status },
			};
			res.json(body);
		} else {
			const body: CredentialTestResponse = {
				success: false,
				error: `Test request failed with status ${testResponse.status}`,
				data: { valid: false, status: testResponse.status },
			};
			res.json(body);
		}
	});

	/**
	 * DELETE /v1/credentials/:id
	 * Delete a credential by ID.
	 * Body: { ownerId }
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.delete('/:id', auth, async (req: Request, res: Response) => {
		const deleteId = req.params.id as string;
		const { ownerId } = req.body as { ownerId?: string };

		if (!ownerId) {
			const body: CredentialDeleteResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
			return;
		}

		const deleted = await credentialService.delete(deleteId, ownerId);
		if (!deleted) {
			const body: CredentialDeleteResponse = { success: false, error: 'Credential not found' };
			res.status(404).json(body);
			return;
		}
		const body: CredentialDeleteResponse = { success: true, data: { deleted: true } };
		res.json(body);
	});

	return router;
}
