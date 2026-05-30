import { Router } from 'express';
import type { Request, Response } from 'express';
import { getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/encryptionService.js';
import { CredentialService } from '../services/credentialService.js';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);

export const oauth2Router = Router();

/**
 * GET /oauth2/authorize/:credentialId
 * Builds and returns the OAuth2 authorization URL for the given credential.
 * Requires `ownerId` query parameter.
 * The credential must already exist with clientId and scope stored.
 * Both credentialId and ownerId are encoded in the state parameter so the
 * callback can verify ownership without a separate lookup.
 */
oauth2Router.get('/authorize/:credentialId', async (req: Request, res: Response) => {
	const credentialId = req.params.credentialId as string;
	const ownerId = req.query.ownerId as string | undefined;

	if (!ownerId) {
		res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
		return;
	}

	const metadata = await credentialService.getById(credentialId, ownerId);
	if (!metadata) {
		res.status(404).json({ success: false, error: 'Credential not found' });
		return;
	}

	const definition = getCredentialDefinition(metadata.type);
	if (!definition || definition.type !== 'oauth2' || !definition.oauth2) {
		res.status(400).json({ success: false, error: 'Credential is not an OAuth2 type' });
		return;
	}

	const data = await credentialService.getDecryptedData(credentialId, ownerId);
	if (!data) {
		res.status(500).json({ success: false, error: 'Failed to decrypt credential data' });
		return;
	}

	const clientIdKey = definition.oauth2.clientIdProperty ?? 'clientId';
	const clientId = data[clientIdKey] as string;
	const scope = (data.scope as string) ?? definition.oauth2.scope ?? '';

	const baseUrl = `${req.protocol}://${req.get('host')}`;
	const redirectUri = `${baseUrl}/oauth2/callback`;

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

	res.json({ success: true, data: { authorizationUrl } });
});

/**
 * GET /oauth2/callback
 * Receives the authorization code from the OAuth2 provider.
 * Exchanges it for access + refresh tokens and stores them encrypted.
 * The state parameter contains a base64-encoded JSON object with credentialId and ownerId.
 */
oauth2Router.get('/callback', async (req: Request, res: Response) => {
	const code = req.query.code as string | undefined;
	const state = req.query.state as string | undefined;
	const error = req.query.error as string | undefined;

	if (error) {
		res.status(400).json({ success: false, error: `OAuth2 error: ${error}` });
		return;
	}

	if (!code || !state) {
		res.status(400).json({ success: false, error: 'Missing code or state parameter' });
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
		res.status(400).json({ success: false, error: 'Invalid state parameter' });
		return;
	}

	const metadata = await credentialService.getById(credentialId, ownerId);
	if (!metadata) {
		res.status(404).json({ success: false, error: 'Credential not found for state' });
		return;
	}

	const definition = getCredentialDefinition(metadata.type);
	if (!definition || definition.type !== 'oauth2' || !definition.oauth2) {
		res.status(400).json({ success: false, error: 'Credential definition is not OAuth2' });
		return;
	}

	const data = await credentialService.getDecryptedData(credentialId, ownerId);
	if (!data) {
		res.status(500).json({ success: false, error: 'Failed to decrypt credential data' });
		return;
	}

	const clientIdKey = definition.oauth2.clientIdProperty ?? 'clientId';
	const clientSecretKey = definition.oauth2.clientSecretProperty ?? 'clientSecret';
	const clientId = data[clientIdKey] as string;
	const clientSecret = data[clientSecretKey] as string;

	const baseUrl = `${req.protocol}://${req.get('host')}`;
	const redirectUri = `${baseUrl}/oauth2/callback`;

	// Exchange code for tokens
	const body = new URLSearchParams({
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
		body: body.toString(),
	});

	if (!tokenResponse.ok) {
		const errorBody = await tokenResponse.text();
		res.status(502).json({
			success: false,
			error: `Token exchange failed (${tokenResponse.status}): ${errorBody}`,
		});
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

	res.json({ success: true, data: { message: 'OAuth2 tokens saved successfully' } });
});
