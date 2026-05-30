import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { credentials } from '../db/schema/index.js';
import { EncryptionService } from './encryptionService.js';
import type { CredentialMetadata } from '@repo/types';

// Re-export so existing imports from this file continue to work
export type { CredentialMetadata };

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

	/** List all credentials for an owner (metadata only — no decrypted data) */
	async listByOwner(ownerId: string): Promise<CredentialMetadata[]> {
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
			.where(eq(credentials.ownerId, ownerId));

		return rows;
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
	 * Update only the encrypted data payload (used by OAuth token refresh).
	 * This is an internal operation called after a successful OAuth callback —
	 * ownership was already verified when the credential was fetched during the flow.
	 * The ownerId is included in the WHERE clause as a defence-in-depth measure.
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
