import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/EncryptionService.js';
import { CredentialService } from '../services/CredentialService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type { OAuth2AuthorizeResponse, OAuth2CallbackResponse } from '@repo/types';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);

/** Maximum age for an OAuth2 CSRF state token (5 minutes) */
const STATE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Returns the APP_URL env var (the public-facing frontend URL).
 * Used as the base for OAuth2 redirect URIs so the callback lands on
 * the frontend rather than the (unexposed) backend.
 */
function getAppUrl(): string {
	const url = process.env.APP_URL;
	if (!url) {
		throw new Error('APP_URL environment variable is not set');
	}
	return url.replace(/\/+$/, '');
}

/**
 * Returns the CREDENTIAL_ENCRYPTION_KEY as a Buffer for HMAC operations.
 * Reuses the same key already used for AES-256-GCM encryption.
 */
function getHmacKey(): Buffer {
	const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
	if (!hex) {
		throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is not set');
	}
	return Buffer.from(hex, 'hex');
}

/**
 * Creates a HMAC-signed, time-limited OAuth2 CSRF state token.
 *
 * Structure: base64url( JSON({ credentialId, ownerId, exp, sig }) )
 *   - exp: Unix timestamp (ms) after which the token is invalid
 *   - sig: HMAC-SHA256 of "credentialId:ownerId:exp" using CREDENTIAL_ENCRYPTION_KEY
 */
function createOAuthState(credentialId: string, ownerId: string): string {
	const exp = Date.now() + STATE_MAX_AGE_MS;
	const payload = `${credentialId}:${ownerId}:${exp}`;
	const sig = crypto.createHmac('sha256', getHmacKey()).update(payload).digest('hex');
	const state = JSON.stringify({ credentialId, ownerId, exp, sig });
	return Buffer.from(state).toString('base64url');
}

/**
 * Verifies a CSRF state token and returns its payload.
 * Throws if the token is tampered with or expired.
 */
function verifyOAuthState(stateToken: string): { credentialId: string; ownerId: string } {
	let parsed: { credentialId?: string; ownerId?: string; exp?: number; sig?: string };
	try {
		parsed = JSON.parse(Buffer.from(stateToken, 'base64url').toString('utf8')) as {
			credentialId?: string;
			ownerId?: string;
			exp?: number;
			sig?: string;
		};
	} catch {
		throw new Error('Invalid state token format');
	}

	const { credentialId, ownerId, exp, sig } = parsed;
	if (!credentialId || !ownerId || !exp || !sig) {
		throw new Error('State token is missing required fields');
	}

	// Verify HMAC signature
	const payload = `${credentialId}:${ownerId}:${exp}`;
	const expectedSig = crypto.createHmac('sha256', getHmacKey()).update(payload).digest('hex');
	if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
		throw new Error('State token signature is invalid');
	}

	// Check expiry
	if (Date.now() > exp) {
		throw new Error('State token has expired');
	}

	return { credentialId, ownerId };
}

/**
 * Generates a PKCE code_verifier and its S256 code_challenge.
 * The verifier must be stored temporarily in the credential data and sent
 * in the token exchange request.
 */
function generatePkce(): { codeVerifier: string; codeChallenge: string } {
	// RFC 7636: verifier must be 43–128 chars of unreserved characters
	const codeVerifier = crypto.randomBytes(48).toString('base64url');
	const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
	return { codeVerifier, codeChallenge };
}

/**
 * Factory — creates the OAuth2 router with an injected AuthService instance.
 *
 * Routes:
 *   GET /v1/oauth2/authorize/:credentialId — protected: build authorization URL
 *                                            or perform client_credentials exchange
 *   GET /v1/oauth2/callback               — public: OAuth provider redirect target
 */
export function createOAuth2Router(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * GET /v1/oauth2/authorize/:credentialId
	 * Protected. For authorization_code flow: builds and returns the OAuth2
	 * authorization URL. For client_credentials flow: performs the token exchange
	 * server-side (no browser redirect needed) and returns success immediately.
	 * Requires `ownerId` query parameter.
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

		const oauth2Config = definition.oauth2;
		const grantType = oauth2Config.grantType ?? 'authorizationCode';

		// ── Client Credentials grant — no browser redirect ────────────────────
		if (grantType === 'clientCredentials') {
			const clientIdKey = oauth2Config.clientIdProperty ?? 'clientId';
			const clientSecretKey = oauth2Config.clientSecretProperty ?? 'clientSecret';
			const clientId = data[clientIdKey] as string;
			const clientSecret = data[clientSecretKey] as string;

			const tokenBody = new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: clientId,
				client_secret: clientSecret,
			});
			if (oauth2Config.scope) {
				tokenBody.set('scope', oauth2Config.scope);
			}

			const headers: Record<string, string> = {
				'Content-Type': 'application/x-www-form-urlencoded',
			};
			if (oauth2Config.authStyle === 'inHeader') {
				const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
				headers['Authorization'] = `Basic ${encoded}`;
			}

			const tokenResponse = await fetch(oauth2Config.accessTokenUrl, {
				method: 'POST',
				headers,
				body: tokenBody.toString(),
			});

			if (!tokenResponse.ok) {
				const errorBody = await tokenResponse.text();
				logger.warn(
					{ credentialId, status: tokenResponse.status },
					'Client credentials token exchange failed',
				);
				const body: OAuth2AuthorizeResponse = {
					success: false,
					error: `Token exchange failed (${tokenResponse.status}): ${errorBody}`,
				};
				res.status(502).json(body);
				return;
			}

			const tokens = (await tokenResponse.json()) as {
				access_token: string;
				expires_in?: number;
			};

			await credentialService.updateData(credentialId, ownerId, {
				...data,
				accessToken: tokens.access_token,
				expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
			});

			const body: OAuth2AuthorizeResponse = {
				success: true,
				data: { authorizationUrl: '' }, // no URL for client_credentials
			};
			res.json(body);
			return;
		}

		// ── Authorization Code / PKCE flow ────────────────────────────────────
		const clientIdKey = oauth2Config.clientIdProperty ?? 'clientId';
		const clientId = data[clientIdKey] as string;
		const scope = (data.scope as string) ?? oauth2Config.scope ?? '';

		const appUrl = getAppUrl();
		const redirectUri = `${appUrl}/oauth2/callback`;

		// HMAC-signed state — carries credentialId + ownerId with expiry and signature
		const state = createOAuthState(credentialId, ownerId);

		const params = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope,
			state,
			access_type: 'offline',
			prompt: 'consent',
		});

		// PKCE: generate verifier + challenge, store verifier in credential for callback
		if (oauth2Config.usePkce) {
			const { codeVerifier, codeChallenge } = generatePkce();

			// Store the verifier temporarily — it is cleared after the token exchange
			await credentialService.updateData(credentialId, ownerId, {
				...data,
				codeVerifier,
			});

			params.set('code_challenge', codeChallenge);
			params.set('code_challenge_method', 'S256');
		}

		const authorizationUrl = `${oauth2Config.authorizationUrl}?${params.toString()}`;

		const body: OAuth2AuthorizeResponse = { success: true, data: { authorizationUrl } };
		res.json(body);
	});

	/**
	 * GET /v1/oauth2/callback
	 * Public — this is the redirect target registered with the OAuth provider.
	 * Cannot carry a Bearer token since the provider controls the redirect.
	 * Ownership and integrity are verified via the HMAC-signed state parameter.
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

		// Verify HMAC-signed state — rejects tampered or expired tokens
		let credentialId: string;
		let ownerId: string;
		try {
			({ credentialId, ownerId } = verifyOAuthState(state));
		} catch (err) {
			logger.warn({ err }, 'OAuth2 callback: state verification failed');
			const body: OAuth2CallbackResponse = {
				success: false,
				error: 'Invalid or expired state parameter',
			};
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

		const oauth2Config = definition.oauth2;
		const clientIdKey = oauth2Config.clientIdProperty ?? 'clientId';
		const clientSecretKey = oauth2Config.clientSecretProperty ?? 'clientSecret';
		const clientId = data[clientIdKey] as string;
		const clientSecret = data[clientSecretKey] as string;

		const appUrl = getAppUrl();
		const redirectUri = `${appUrl}/oauth2/callback`;

		const tokenBody = new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: clientId,
		});

		// PKCE: use code_verifier instead of client_secret
		if (oauth2Config.usePkce) {
			const codeVerifier = data.codeVerifier as string | undefined;
			if (!codeVerifier) {
				const body: OAuth2CallbackResponse = {
					success: false,
					error: 'PKCE code verifier missing from credential data',
				};
				res.status(400).json(body);
				return;
			}
			tokenBody.set('code_verifier', codeVerifier);
		} else {
			tokenBody.set('client_secret', clientSecret);
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/x-www-form-urlencoded',
		};

		// If authStyle is inHeader, use Basic auth (only for non-PKCE flows)
		if (oauth2Config.authStyle === 'inHeader' && !oauth2Config.usePkce) {
			const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
			headers['Authorization'] = `Basic ${encoded}`;
		}

		const tokenResponse = await fetch(oauth2Config.accessTokenUrl, {
			method: 'POST',
			headers,
			body: tokenBody.toString(),
		});

		if (!tokenResponse.ok) {
			const errorBody = await tokenResponse.text();
			logger.warn({ credentialId, status: tokenResponse.status }, 'OAuth2 token exchange failed');
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

		// Attempt to fetch the connected account identifier using the test request endpoint
		let connectedAccount: string | undefined;
		if (definition.testRequest?.accountIdentifierKey) {
			try {
				const identityRes = await fetch(definition.testRequest.url, {
					method: definition.testRequest.method,
					headers: { Authorization: `Bearer ${tokens.access_token}` },
				});
				if (identityRes.ok) {
					const identity = (await identityRes.json()) as Record<string, unknown>;
					const value = definition.testRequest.accountIdentifierKey
						.split('.')
						.reduce<unknown>((obj: unknown, key: string) => {
							if (obj !== null && typeof obj === 'object') {
								return (obj as Record<string, unknown>)[key];
							}
							return undefined;
						}, identity);
					if (typeof value === 'string' || typeof value === 'number') {
						connectedAccount = String(value);
					}
				}
			} catch (err) {
				// Non-fatal — tokens are still saved even if identity fetch fails
				logger.warn(
					{ credentialId, err },
					'Failed to fetch account identifier after OAuth2 callback',
				);
			}
		}

		// Merge tokens into credential data, clearing the temporary codeVerifier
		const { codeVerifier: _removed, ...dataWithoutVerifier } = data as Record<string, unknown> & {
			codeVerifier?: string;
		};
		const updatedData: Record<string, unknown> = {
			...dataWithoutVerifier,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token ?? data.refreshToken,
			expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
			...(connectedAccount !== undefined ? { connectedAccount } : {}),
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
