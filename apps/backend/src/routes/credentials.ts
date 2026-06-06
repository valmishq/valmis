import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadCredentialDefinitions, getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/EncryptionService.js';
import {
	CredentialService,
	redactCredentialData,
	unredactCredentialData,
} from '../services/CredentialService.js';
import { CredentialResolverService } from '../services/CredentialResolverService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	CredentialDefinitionsResponse,
	CredentialDefinitionResponse,
	CredentialsListResponse,
	CredentialResponse,
	CredentialDeleteResponse,
	CredentialTestResponse,
	CreateCredentialRequestBody,
	UpdateCredentialRequestBody,
	OwnerIdRequestBody,
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
 *   GET    /v1/credentials/:id/data          — get redacted credential data (for edit form pre-fill)
 *   POST   /v1/credentials                   — create a new credential
 *   PUT    /v1/credentials/:id               — update a credential (supports sentinel values)
 *   POST   /v1/credentials/:id/test          — test a credential (saves connectedAccount on success)
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
	 * GET /v1/credentials/:id/data
	 * Returns the credential's data payload with sensitive fields redacted.
	 * Secret-typed properties and internal OAuth fields (accessToken, refreshToken,
	 * codeVerifier) are replaced with the sentinel value "__REDACTED__".
	 * This endpoint is used to pre-fill the edit form in the UI.
	 * Requires `ownerId` query parameter.
	 */
	router.get('/:id/data', auth, async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const ownerId = req.query.ownerId as string | undefined;
		if (!ownerId) {
			res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
			return;
		}

		const metadata = await credentialService.getById(id, ownerId);
		if (!metadata) {
			res.status(404).json({ success: false, error: 'Credential not found' });
			return;
		}

		const definition = getCredentialDefinition(metadata.type);
		if (!definition) {
			res.status(400).json({ success: false, error: `Unknown credential type: ${metadata.type}` });
			return;
		}

		const data = await credentialService.getDecryptedData(id, ownerId);
		if (!data) {
			res.status(500).json({ success: false, error: 'Failed to decrypt credential data' });
			return;
		}

		const redacted = redactCredentialData(data, definition);
		res.json({ success: true, data: redacted });
	});

	/**
	 * POST /v1/credentials
	 * Create a new credential instance.
	 * Body: { ownerId, name, type, data }
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const { ownerId, name, type, data } = req.body as CreateCredentialRequestBody;

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
	 *
	 * When `data` is provided, any field containing the sentinel value "__REDACTED__"
	 * is treated as "keep the existing stored value" — the real secret is restored
	 * from the DB before re-encrypting. This allows the edit form to submit without
	 * sending actual secret values back.
	 *
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.put('/:id', auth, async (req: Request, res: Response) => {
		const { ownerId, name, data } = req.body as UpdateCredentialRequestBody;

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

		// Unredact incoming data before saving — restore sentinel-masked fields from DB
		let finalData = data;
		if (data) {
			const stored = await credentialService.getDecryptedData(updateId, ownerId);
			if (!stored) {
				const body: CredentialResponse = { success: false, error: 'Credential not found' };
				res.status(404).json(body);
				return;
			}
			finalData = unredactCredentialData(data, stored);
		}

		const updated = await credentialService.update(updateId, ownerId, { name, data: finalData });
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
	 * Validates a credential by executing the testRequest defined in the YAML definition
	 * via executeWithCredential() (which handles reactive 401 token refresh for OAuth2).
	 *
	 * On success, if testRequest.accountIdentifierKey is defined, the identity value
	 * is extracted from the response and saved as `connectedAccount` in the credential data.
	 * This makes connectedAccount work for API key types, not just OAuth2.
	 *
	 * Requires `ownerId` in the request body.
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.post('/:id/test', auth, async (req: Request, res: Response) => {
		const testId = req.params.id as string;
		const { ownerId } = req.body as OwnerIdRequestBody;

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

		// Resolve {{properties.keyName}} placeholders in the test URL.
		// Required for integrations like Home Assistant where host/port come from
		// credential properties rather than a fixed URL in the YAML definition.
		const credentialData = await credentialService.getDecryptedData(testId, ownerId);
		if (!credentialData) {
			const body: CredentialTestResponse = {
				success: false,
				error: 'Failed to decrypt credential data',
			};
			res.status(500).json(body);
			return;
		}
		const resolvedTestUrl = resolverService.interpolateTemplate(
			definition.testRequest.url,
			credentialData,
		);

		// Execute via resolver — handles proactive/reactive OAuth2 token refresh
		const testResponse = await resolverService.executeWithCredential(testId, ownerId, {
			url: resolvedTestUrl,
			method: definition.testRequest.method,
		});

		if (!testResponse.ok) {
			// Log the full response body so developers can diagnose auth failures
			// without having to set up network inspection tools.
			let responseText = '';
			try {
				responseText = await testResponse.text();
			} catch {
				// ignore read errors
			}
			logger.warn(
				{
					credentialId: testId,
					credentialType: metadata.type,
					testUrl: definition.testRequest.url,
					status: testResponse.status,
					responseBody: responseText,
				},
				'Credential test request failed',
			);
			const body: CredentialTestResponse = {
				success: false,
				error: `Test request failed with status ${testResponse.status}`,
				data: { valid: false, status: testResponse.status },
			};
			res.json(body);
			return;
		}

		// On success, attempt to extract and persist the account identifier
		if (definition.testRequest.accountIdentifierKey) {
			try {
				const responseBody = (await testResponse.json()) as Record<string, unknown>;
				// Traverse dot-notation path (e.g. "data.user.login")
				const value = definition.testRequest.accountIdentifierKey
					.split('.')
					.reduce<unknown>((obj, key) => {
						if (obj !== null && typeof obj === 'object') {
							return (obj as Record<string, unknown>)[key];
						}
						return undefined;
					}, responseBody);

				if (typeof value === 'string' || typeof value === 'number') {
					// Merge connectedAccount into the stored data without touching other fields
					const currentData = await credentialService.getDecryptedData(testId, ownerId);
					if (currentData) {
						await credentialService.updateData(testId, ownerId, {
							...currentData,
							connectedAccount: String(value),
						});
					}
				}
			} catch (err) {
				// Non-fatal — test still passes even if identity extraction fails
				logger.warn(
					{ credentialId: testId, err },
					'Failed to extract account identifier from test response',
				);
			}
		}

		const body: CredentialTestResponse = {
			success: true,
			data: { valid: true, status: testResponse.status },
		};
		res.json(body);
	});

	/**
	 * DELETE /v1/credentials/:id
	 * Delete a credential by ID.
	 * Body: { ownerId }
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.delete('/:id', auth, async (req: Request, res: Response) => {
		const deleteId = req.params.id as string;
		const { ownerId } = req.body as OwnerIdRequestBody;

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
