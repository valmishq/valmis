import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema/index.js';
import { EncryptionService } from './EncryptionService.js';
import type { ApiKey } from '@repo/types';

const encryption = new EncryptionService();

/**
 * Service responsible for API key generation, validation, listing, and deletion.
 * Uses EncryptionService (AES-256-GCM) to store encrypted keys in the DB.
 * Stores a SHA-256 hash alongside for fast constant-time lookup without decryption.
 */
export class ApiKeyService {
	/**
	 * Generate a new API key for a user.
	 * Stores the encrypted key and its SHA-256 hash in the DB.
	 * Returns the raw plaintext key — this is the ONLY time it is available.
	 */
	static async generate(
		userId: string,
		name: string,
		expiresInDays: number,
		_actor: string,
		_ip: string,
	): Promise<string> {
		const rawKey = crypto.randomBytes(32).toString('hex');
		const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
		const encryptedKey = encryption.encrypt(rawKey);

		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + expiresInDays);

		await db.insert(apiKeys).values({
			userId,
			name,
			key: encryptedKey,
			keyHash,
			expiresAt,
		});

		console.info(`[audit] GENERATE api_key userId=${userId} actor=${_actor} ip=${_ip}`);
		return rawKey;
	}

	/**
	 * List all API keys for a user.
	 * Returns masked keys: first 5 chars + '*****'. Never returns the full key.
	 */
	static async getKeys(userId: string): Promise<ApiKey[]> {
		const rows = await db
			.select({
				id: apiKeys.id,
				name: apiKeys.name,
				key: apiKeys.key,
				expiresAt: apiKeys.expiresAt,
				createdAt: apiKeys.createdAt,
			})
			.from(apiKeys)
			.where(eq(apiKeys.userId, userId));

		return rows.map((row) => {
			const decrypted = encryption.decrypt(row.key);
			const masked = decrypted.slice(0, 5) + '*****';
			return {
				id: row.id,
				name: row.name,
				key: masked,
				expiresAt: row.expiresAt.toISOString(),
				createdAt: row.createdAt.toISOString(),
			};
		});
	}

	/**
	 * Validate a raw API key.
	 * Hashes the input and looks up the DB by hash (fast path).
	 * Checks expiry and decrypts to confirm match (defence-in-depth).
	 * Returns the userId on success, or null if invalid/expired.
	 */
	static async validateKey(key: string): Promise<string | null> {
		const keyHash = crypto.createHash('sha256').update(key).digest('hex');

		const rows = await db
			.select({
				userId: apiKeys.userId,
				key: apiKeys.key,
				expiresAt: apiKeys.expiresAt,
			})
			.from(apiKeys)
			.where(eq(apiKeys.keyHash, keyHash))
			.limit(1);

		if (!rows[0]) return null;

		const row = rows[0];

		// Reject expired keys
		if (row.expiresAt < new Date()) return null;

		// Decrypt and compare as a defence-in-depth check
		const decrypted = encryption.decrypt(row.key);
		if (decrypted !== key) return null;

		return row.userId;
	}

	/**
	 * Delete an API key by ID, enforcing ownership.
	 * Returns false if the key does not exist or belongs to another user.
	 */
	static async deleteKey(
		id: string,
		userId: string,
		_actor: string,
		_ip: string,
	): Promise<boolean> {
		const result = await db
			.delete(apiKeys)
			.where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));

		if ((result.rowCount ?? 0) > 0) {
			console.info(`[audit] DELETE api_key id=${id} userId=${userId} actor=${_actor} ip=${_ip}`);
			return true;
		}
		return false;
	}
}
