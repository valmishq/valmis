import { Router } from 'express';
import type { Request, Response } from 'express';
import { getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/encryptionService.js';
import { CredentialService } from '../services/credentialService.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type { OAuth2AuthorizeResponse, OAuth2CallbackResponse } from '@repo/types';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);

/**
 * Factory — creates the OAuth2 router with an injected AuthService instance.
 *
 * Routes:
 *   GET /v1/oauth2/authorize/:credentialId — protected: build authorization URL
 *   GET /v1/oauth2/callback               — public: OAuth provider redirect target
 */
export function createOAuth2Router(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * GET /v1/oauth2/authorize/:credentialId
	 * Protected. Builds and returns the OAuth2 authorization URL for the given credential.
	 * Requires `ownerId` query parameter.
	 * Both credentialId and ownerId are encoded in the state parameter so the
	 * callback can verify ownership without a separate lookup.
	 */
	router.get('/authorize/:credentialId', auth, async (req: Request, res: Response) => {
		const credentialId = req.params.credentialId as string;
		const ownerId = req.query.ownerId as string | undefined;

		if (!ownerId) {
			const body: OAuth2AuthorizeResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
			return;
		}

		const metadata = await credentialService.getById(credentialId, ownerId);
		if (!metadata) {
			const body: OAuth2AuthorizeResponse = { success: false, error: 'Credential not found' };
			res.status(404).json(body);
			return;
		}

		const definition = getCredentialDefinition(metadata.type);
		if (!definition || definition.type !== 'oauth2' || !definition.oauth2) {
			const body: OAuth2AuthorizeResponse = {
				success: false,
				error: 'Credential is not an OAuth2 type',
			};
			res.status(400).json(body);
			return;
		}

		const data = await credentialService.getDecryptedData(credentialId, ownerId);
		if (!data) {
			const body: OAuth2AuthorizeResponse = {
				success: false,
				error: 'Failed to decrypt credential data',
			};
			res.status(500).json(body);
			return;
		}

		const clientIdKey = definition.oauth2.clientIdProperty ?? 'clientId';
		const clientId = data[clientIdKey] as string;
		const scope = (data.scope as string) ?? definition.oauth2.scope ?? '';

		const baseUrl = `${req.protocol}://${req.get('host')}`;
		const redirectUri = `${baseUrl}/v1/oauth2/callback`;

		// Encode both credentialId and ownerId in state so the callback can resolve ownership
		const state = Buffer.from(JSON.stringify({ credentialId, ownerId })).toString('base64');

		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope,
			state,
			access_type: 'offline',
			prompt: 'consent',
		});

		const authorizationUrl = `${definition.oauth2.authorizationUrl}?${params.toString()}`;

		const body: OAuth2AuthorizeResponse = { success: true, data: { authorizationUrl } };
		res.json(body);
	});

	/**
	 * GET /v1/oauth2/callback
	 * Public — this is the redirect target registered with the OAuth provider.
	 * Cannot carry a Bearer token since the provider controls the redirect.
	 * Ownership is verified via the state parameter (credentialId + ownerId encoded at authorize time).
	 */
	router.get('/callback', async (req: Request, res: Response) => {
		const code = req.query.code as string | undefined;
		const state = req.query.state as string | undefined;
		const error = req.query.error as string | undefined;

		if (error) {
			const body: OAuth2CallbackResponse = { success: false, error: `OAuth2 error: ${error}` };
			res.status(400).json(body);
			return;
		}

		if (!code || !state) {
			const body: OAuth2CallbackResponse = {
				success: false,
				error: 'Missing code or state parameter',
			};
			res.status(400).json(body);
			return;
		}

		// Decode credentialId and ownerId from state
		let credentialId: string;
		let ownerId: string;
		try {
			const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8')) as {
				credentialId?: string;
				ownerId?: string;
			};
			if (!decoded.credentialId || !decoded.ownerId) {
				throw new Error('Missing fields in state');
			}
			credentialId = decoded.credentialId;
			ownerId = decoded.ownerId;
		} catch {
			const body: OAuth2CallbackResponse = { success: false, error: 'Invalid state parameter' };
			res.status(400).json(body);
			return;
		}

		const metadata = await credentialService.getById(credentialId, ownerId);
		if (!metadata) {
			const body: OAuth2CallbackResponse = {
				success: false,
				error: 'Credential not found for state',
			};
			res.status(404).json(body);
			return;
		}

		const definition = getCredentialDefinition(metadata.type);
		if (!definition || definition.type !== 'oauth2' || !definition.oauth2) {
			const body: OAuth2CallbackResponse = {
				success: false,
				error: 'Credential definition is not OAuth2',
			};
			res.status(400).json(body);
			return;
		}

		const data = await credentialService.getDecryptedData(credentialId, ownerId);
		if (!data) {
			const body: OAuth2CallbackResponse = {
				success: false,
				error: 'Failed to decrypt credential data',
			};
			res.status(500).json(body);
			return;
		}

		const clientIdKey = definition.oauth2.clientIdProperty ?? 'clientId';
		const clientSecretKey = definition.oauth2.clientSecretProperty ?? 'clientSecret';
		const clientId = data[clientIdKey] as string;
		const clientSecret = data[clientSecretKey] as string;

		const baseUrl = `${req.protocol}://${req.get('host')}`;
		const redirectUri = `${baseUrl}/v1/oauth2/callback`;

		// Exchange code for tokens
		const tokenBody = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: clientId,
			client_secret: clientSecret,
		});

		const headers: Record<string, string> = {
			'Content-Type': 'application/x-www-form-urlencoded',
		};

		// If authStyle is inHeader, use Basic auth
		if (definition.oauth2.authStyle === 'inHeader') {
			const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
			headers['Authorization'] = `Basic ${encoded}`;
		}

		const tokenResponse = await fetch(definition.oauth2.accessTokenUrl, {
			method: 'POST',
			headers,
			body: tokenBody.toString(),
		});

		if (!tokenResponse.ok) {
			const errorBody = await tokenResponse.text();
			const body: OAuth2CallbackResponse = {
				success: false,
				error: `Token exchange failed (${tokenResponse.status}): ${errorBody}`,
			};
			res.status(502).json(body);
			return;
		}

		const tokens = (await tokenResponse.json()) as {
			access_token: string;
			refresh_token?: string;
			expires_in?: number;
		};

		// Merge tokens into existing credential data and re-encrypt with ownerId in WHERE
		const updatedData: Record<string, unknown> = {
			...data,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token ?? data.refreshToken,
			expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
		};

		await credentialService.updateData(credentialId, ownerId, updatedData);

		const body: OAuth2CallbackResponse = {
			success: true,
			data: { message: 'OAuth2 tokens saved successfully' },
		};
		res.json(body);
	});

	return router;
}
