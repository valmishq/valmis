import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { credentials } from '../db/schema/index.js';
import { EncryptionService } from './EncryptionService.js';
import type { CredentialMetadata, CredentialDefinition } from '@repo/types';

// Re-export so existing imports from this file continue to work
export type { CredentialMetadata };

/**
 * Sentinel value placed in credential data when returning redacted fields to
 * the frontend. If the frontend sends this value back, it means "keep the
 * existing stored value" — unredact() merges the real value back before saving.
 */
export const CREDENTIAL_SENTINEL = '__REDACTED__';

/** Input for creating a new credential */
export interface CreateCredentialInput {
	ownerId: string;
	name: string;
	type: string;
	data: Record<string, unknown>;
}

/** Input for updating an existing credential */
export interface UpdateCredentialInput {
	name?: string;
	data?: Record<string, unknown>;
}

/**
 * Replaces sensitive fields in decrypted credential data before sending to the frontend.
 *
 * Redacted fields:
 *   - Any property where definition.properties[n].type === 'secret'
 *   - Internal OAuth fields: accessToken, refreshToken, codeVerifier
 *
 * These fields are replaced with CREDENTIAL_SENTINEL so the UI can pre-fill the
 * form (showing that a value exists) without receiving the actual secret.
 */
export function redactCredentialData(
	data: Record<string, unknown>,
	definition: CredentialDefinition,
): Record<string, unknown> {
	const result = { ...data };

	// Redact user-defined secret properties
	for (const prop of definition.properties) {
		if (prop.type === 'secret' && prop.name in result) {
			result[prop.name] = CREDENTIAL_SENTINEL;
		}
	}

	// Always redact internal OAuth fields — these are never typed by the user
	const internalSecrets = ['accessToken', 'refreshToken', 'codeVerifier'];
	for (const field of internalSecrets) {
		if (field in result) {
			result[field] = CREDENTIAL_SENTINEL;
		}
	}

	return result;
}

/**
 * Merges sentinel values back with real stored values before re-encrypting.
 * Any key in `incoming` whose value is CREDENTIAL_SENTINEL is replaced with
 * the corresponding value from `stored`. This ensures that editing a credential's
 * name or a non-secret field does not wipe the stored secrets.
 */
export function unredactCredentialData(
	incoming: Record<string, unknown>,
	stored: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...incoming };

	for (const [key, value] of Object.entries(result)) {
		if (value === CREDENTIAL_SENTINEL) {
			// Replace sentinel with the real stored value (or delete the key if not stored)
			if (key in stored) {
				result[key] = stored[key];
			} else {
				delete result[key];
			}
		}
	}

	return result;
}

/**
 * Service responsible for credential CRUD operations.
 * Handles encryption/decryption of the secret payload transparently.
 *
 * Ownership is enforced at the DB layer on every operation: all queries that
 * target a specific record include both `id` and `ownerId` in the WHERE clause.
 * If the ownerId does not match, the DB returns no rows and the method returns
 * null/false — the caller treats this as a 404 without revealing the mismatch.
 */
export class CredentialService {
	private encryption: EncryptionService;

	constructor(encryption: EncryptionService) {
		this.encryption = encryption;
	}

	/**
	 * List all credentials for an owner.
	 * `isAuthorized` is derived from the presence of an OAuth2 access token.
	 * `connectedAccount` is read from the encrypted data blob for all auth types —
	 * it is set by the test endpoint whenever accountIdentifierKey resolves to a value.
	 */
	async listByOwner(ownerId: string): Promise<CredentialMetadata[]> {
		const rows = await db
			.select({
				id: credentials.id,
				ownerId: credentials.ownerId,
				name: credentials.name,
				type: credentials.type,
				data: credentials.data,
				createdAt: credentials.createdAt,
				updatedAt: credentials.updatedAt,
			})
			.from(credentials)
			.where(eq(credentials.ownerId, ownerId))
			.orderBy(desc(credentials.createdAt));

		return rows.map((row) => {
			const { data: encryptedData, ...meta } = row;
			try {
				const parsed = JSON.parse(this.encryption.decrypt(encryptedData)) as Record<
					string,
					unknown
				>;
				const isAuthorized =
					typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0;
				const connectedAccount =
					typeof parsed.connectedAccount === 'string' ? parsed.connectedAccount : undefined;
				return { ...meta, isAuthorized, connectedAccount };
			} catch {
				// If decryption fails, return metadata without auth status
				return meta;
			}
		});
	}

	/**
	 * Get a single credential's metadata by ID.
	 * Returns null if the record does not exist or ownerId does not match.
	 */
	async getById(id: string, ownerId: string): Promise<CredentialMetadata | null> {
		const rows = await db
			.select({
				id: credentials.id,
				ownerId: credentials.ownerId,
				name: credentials.name,
				type: credentials.type,
				createdAt: credentials.createdAt,
				updatedAt: credentials.updatedAt,
			})
			.from(credentials)
			.where(and(eq(credentials.id, id), eq(credentials.ownerId, ownerId)))
			.limit(1);

		return rows[0] ?? null;
	}

	/**
	 * Get the decrypted data payload for a credential.
	 * Returns null if the record does not exist or ownerId does not match.
	 */
	async getDecryptedData(id: string, ownerId: string): Promise<Record<string, unknown> | null> {
		const rows = await db
			.select({ data: credentials.data })
			.from(credentials)
			.where(and(eq(credentials.id, id), eq(credentials.ownerId, ownerId)))
			.limit(1);

		if (!rows[0]) return null;

		const decrypted = this.encryption.decrypt(rows[0].data);
		return JSON.parse(decrypted) as Record<string, unknown>;
	}

	/** Create a new credential, encrypting the data payload */
	async create(input: CreateCredentialInput): Promise<CredentialMetadata> {
		const id = uuidv4();
		const encryptedData = this.encryption.encrypt(JSON.stringify(input.data));
		const now = new Date();

		await db.insert(credentials).values({
			id,
			ownerId: input.ownerId,
			name: input.name,
			type: input.type,
			data: encryptedData,
			createdAt: now,
			updatedAt: now,
		});

		return {
			id,
			ownerId: input.ownerId,
			name: input.name,
			type: input.type,
			createdAt: now,
			updatedAt: now,
		};
	}

	/**
	 * Update an existing credential (name and/or re-encrypted data).
	 * When `input.data` is provided, it must have already been through unredact()
	 * so sentinels have been replaced with real stored values.
	 * Ownership is enforced at the DB level — returns null if the record does not
	 * exist or ownerId does not match.
	 */
	async update(
		id: string,
		ownerId: string,
		input: UpdateCredentialInput,
	): Promise<CredentialMetadata | null> {
		const existing = await this.getById(id, ownerId);
		if (!existing) return null;

		const updates: Partial<{ name: string; data: string; updatedAt: Date }> = {
			updatedAt: new Date(),
		};

		if (input.name) {
			updates.name = input.name;
		}
		if (input.data) {
			updates.data = this.encryption.encrypt(JSON.stringify(input.data));
		}

		// WHERE includes ownerId so even a race condition cannot mutate another owner's record
		await db
			.update(credentials)
			.set(updates)
			.where(and(eq(credentials.id, id), eq(credentials.ownerId, ownerId)));

		return this.getById(id, ownerId);
	}

	/**
	 * Update only the encrypted data payload (used by OAuth token refresh and test endpoint).
	 * This is an internal operation — ownership was already verified when the credential
	 * was fetched. The ownerId is included in the WHERE clause as a defence-in-depth measure.
	 */
	async updateData(id: string, ownerId: string, data: Record<string, unknown>): Promise<void> {
		const encryptedData = this.encryption.encrypt(JSON.stringify(data));
		await db
			.update(credentials)
			.set({ data: encryptedData, updatedAt: new Date() })
			.where(and(eq(credentials.id, id), eq(credentials.ownerId, ownerId)));
	}

	/**
	 * Delete a credential by ID.
	 * Ownership is enforced at the DB level — returns false if the record does not
	 * exist or ownerId does not match.
	 */
	async delete(id: string, ownerId: string): Promise<boolean> {
		const result = await db
			.delete(credentials)
			.where(and(eq(credentials.id, id), eq(credentials.ownerId, ownerId)));
		return (result.rowCount ?? 0) > 0;
	}
}
