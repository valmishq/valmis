import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadCredentialDefinitions, getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/EncryptionService.js';
import {
	CredentialService,
	redactCredentialData,
	unredactCredentialData,
	stripConnectionState,
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
} from '@repo/types';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);
const resolverService = new CredentialResolverService(credentialService);

/**
 * Factory — creates the credentials router with an injected AuthService instance.
 *
 * All routes requireAuth; ownerId comes from the authenticated token
 * (req.user.sub) — never from the client — so users can only act on
 * their own credentials.
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
 *
 * @param onCredentialDeleted - Invoked after a credential is deleted. Used to
 *   stop channel bot pollers/gateways still running on the deleted token.
 */
export function createCredentialsRouter(
	authService: AuthService,
	onCredentialDeleted?: (credentialId: string) => void,
): Router {
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
	 * List all credential instances owned by the authenticated user.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: CredentialsListResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const list = await credentialService.listByOwner(ownerId);
		const body: CredentialsListResponse = { success: true, data: list };
		res.json(body);
	});

	/**
	 * GET /v1/credentials/:id
	 * Get a single credential's metadata (no decrypted data).
	 * Returns 404 if the record does not exist or does not belong to the
	 * authenticated user.
	 */
	router.get('/:id', auth, async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: CredentialResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
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
	 */
	router.get('/:id/data', auth, async (req: Request, res: Response) => {
		const id = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
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
	 * Body: { name, type, data }
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: CredentialResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const { name, type, data } = req.body as CreateCredentialRequestBody;

		if (!name || !type || !data) {
			const body: CredentialResponse = {
				success: false,
				error: 'name, type, and data are required',
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
	 * Body: { name?, data? }
	 *
	 * When `data` is provided, any field containing the sentinel value "__REDACTED__"
	 * is treated as "keep the existing stored value" — the real secret is restored
	 * from the DB before re-encrypting. This allows the edit form to submit without
	 * sending actual secret values back.
	 *
	 * Returns 404 if the record does not exist or does not belong to the given owner.
	 */
	router.put('/:id', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: CredentialResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const { name, data } = req.body as UpdateCredentialRequestBody;

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
			// Editing credential data invalidates any prior authorization — drop the
			// OAuth tokens and account identifier so the user must re-authorize / re-test.
			finalData = stripConnectionState(unredactCredentialData(data, stored));
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
	 * Returns 404 if the record does not exist or does not belong to the
	 * authenticated user.
	 */
	router.post('/:id/test', auth, async (req: Request, res: Response) => {
		const testId = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: CredentialTestResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
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

		// Execute via resolver — handles proactive/reactive OAuth2 token refresh.
		// Pass testRequest.headers and testRequest.body directly from the YAML definition
		// so integrations like Buffer (GraphQL POST-only) can supply their own headers/body.
		const testResponse = await resolverService.executeWithCredential(testId, ownerId, {
			url: resolvedTestUrl,
			method: definition.testRequest.method,
			headers: definition.testRequest.headers,
			body: definition.testRequest.body,
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

		// On success, persist a connectedAccount so the credential list shows a
		// connected indicator. Prefer a freshly extracted identifier (when the
		// definition provides accountIdentifierKey), otherwise keep any previously
		// stored identifier, otherwise fall back to the literal "Connected".
		// This makes the connected indicator work for every auth type and never
		// downgrades a real account label to "Connected" on a later re-test.
		let extracted: string | null = null;
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
					extracted = String(value);
				}
			} catch (err) {
				// Non-fatal — test still passes even if identity extraction fails
				logger.warn(
					{ credentialId: testId, err },
					'Failed to extract account identifier from test response',
				);
			}
		}

		// Merge connectedAccount into the stored data without touching other fields.
		const existingAccount =
			typeof credentialData.connectedAccount === 'string'
				? credentialData.connectedAccount
				: null;
		await credentialService.updateData(testId, ownerId, {
			...credentialData,
			connectedAccount: extracted ?? existingAccount ?? 'Connected',
		});

		const body: CredentialTestResponse = {
			success: true,
			data: { valid: true, status: testResponse.status },
		};
		res.json(body);
	});

	/**
	 * DELETE /v1/credentials/:id
	 * Delete a credential by ID.
	 * Returns 404 if the record does not exist or does not belong to the
	 * authenticated user.
	 */
	router.delete('/:id', auth, async (req: Request, res: Response) => {
		const deleteId = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: CredentialDeleteResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const deleted = await credentialService.delete(deleteId, ownerId);
		if (!deleted) {
			const body: CredentialDeleteResponse = { success: false, error: 'Credential not found' };
			res.status(404).json(body);
			return;
		}

		// Notify listeners (e.g. channel bot managers) so anything running on the
		// deleted credential's token is shut down immediately.
		onCredentialDeleted?.(deleteId);

		const body: CredentialDeleteResponse = { success: true, data: { deleted: true } };
		res.json(body);
	});

	return router;
}
