import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { llmProviderConfigs } from '../db/schema/index.js';
import { EncryptionService } from './EncryptionService.js';
import type {
	LlmProviderConfig,
	LlmProviderSecretData,
	CreateLlmProviderConfigInput,
	UpdateLlmProviderConfigInput,
} from '@repo/types';

/**
 * Service responsible for LLM provider config CRUD operations.
 * Handles encryption/decryption of the API key payload transparently.
 * Intentionally kept separate from CredentialService — LLM provider configs
 * are a system-level concern (which model the agent uses), not integration credentials.
 *
 * Ownership is enforced at the DB layer on every operation: all queries that
 * target a specific record include both `id` and `ownerId` in the WHERE clause.
 * If the ownerId does not match, the DB returns no rows and the method returns
 * null/false — the route treats this as a 404 without revealing the mismatch.
 */
export class LlmProviderService {
	private encryption: EncryptionService;

	constructor(encryption: EncryptionService) {
		this.encryption = encryption;
	}

	/** List all LLM provider configs for an owner (metadata only — no decrypted data) */
	async listByOwner(ownerId: string): Promise<LlmProviderConfig[]> {
		const rows = await db
			.select({
				id: llmProviderConfigs.id,
				ownerId: llmProviderConfigs.ownerId,
				provider: llmProviderConfigs.provider,
				name: llmProviderConfigs.name,
				model: llmProviderConfigs.model,
				isDefault: llmProviderConfigs.isDefault,
				isEmbeddingModel: llmProviderConfigs.isEmbeddingModel,
				createdAt: llmProviderConfigs.createdAt,
				updatedAt: llmProviderConfigs.updatedAt,
			})
			.from(llmProviderConfigs)
			.where(eq(llmProviderConfigs.ownerId, ownerId));

		return rows as LlmProviderConfig[];
	}

	/**
	 * Get a single LLM provider config's metadata by ID.
	 * Returns null if the record does not exist or ownerId does not match.
	 */
	async getById(id: string, ownerId: string): Promise<LlmProviderConfig | null> {
		const rows = await db
			.select({
				id: llmProviderConfigs.id,
				ownerId: llmProviderConfigs.ownerId,
				provider: llmProviderConfigs.provider,
				name: llmProviderConfigs.name,
				model: llmProviderConfigs.model,
				isDefault: llmProviderConfigs.isDefault,
				isEmbeddingModel: llmProviderConfigs.isEmbeddingModel,
				createdAt: llmProviderConfigs.createdAt,
				updatedAt: llmProviderConfigs.updatedAt,
			})
			.from(llmProviderConfigs)
			.where(and(eq(llmProviderConfigs.id, id), eq(llmProviderConfigs.ownerId, ownerId)))
			.limit(1);

		return (rows[0] as LlmProviderConfig) ?? null;
	}

	/**
	 * Get the decrypted secret data for a config.
	 * Returns null if the record does not exist or ownerId does not match.
	 */
	async getDecryptedData(id: string, ownerId: string): Promise<LlmProviderSecretData | null> {
		const rows = await db
			.select({ data: llmProviderConfigs.data })
			.from(llmProviderConfigs)
			.where(and(eq(llmProviderConfigs.id, id), eq(llmProviderConfigs.ownerId, ownerId)))
			.limit(1);

		if (!rows[0]) return null;

		const decrypted = this.encryption.decrypt(rows[0].data);
		return JSON.parse(decrypted) as LlmProviderSecretData;
	}

	/**
	 * Create a new LLM provider config, encrypting the secret payload.
	 * If isDefault is true, clears isDefault on all other configs for the owner first.
	 */
	async create(input: CreateLlmProviderConfigInput): Promise<LlmProviderConfig> {
		const id = uuidv4();
		const now = new Date();
		const encryptedData = this.encryption.encrypt(JSON.stringify(input.data));
		const isDefault = input.isDefault ?? false;
		const isEmbeddingModel = input.isEmbeddingModel ?? false;

		if (isDefault) {
			await this.clearDefaultForOwner(input.ownerId);
		}

		await db.insert(llmProviderConfigs).values({
			id,
			ownerId: input.ownerId,
			provider: input.provider,
			name: input.name,
			model: input.model,
			isDefault,
			isEmbeddingModel,
			data: encryptedData,
			createdAt: now,
			updatedAt: now,
		});

		return {
			id,
			ownerId: input.ownerId,
			provider: input.provider,
			name: input.name,
			model: input.model,
			isDefault,
			isEmbeddingModel,
			createdAt: now,
			updatedAt: now,
		};
	}

	/**
	 * Update an existing LLM provider config.
	 * Ownership is enforced at the DB level — returns null if the record does not
	 * exist or ownerId does not match.
	 * If isDefault is set to true, clears isDefault on all other configs for the owner first.
	 */
	async update(
		id: string,
		ownerId: string,
		input: UpdateLlmProviderConfigInput,
	): Promise<LlmProviderConfig | null> {
		// Verify ownership at the DB level before mutating
		const existing = await this.getById(id, ownerId);
		if (!existing) return null;

		const updates: Partial<{
			name: string;
			model: string;
			isDefault: boolean;
			isEmbeddingModel: boolean;
			data: string;
			updatedAt: Date;
		}> = { updatedAt: new Date() };

		if (input.name !== undefined) updates.name = input.name;
		if (input.model !== undefined) updates.model = input.model;
		if (input.isEmbeddingModel !== undefined) updates.isEmbeddingModel = input.isEmbeddingModel;
		if (input.data !== undefined) {
			updates.data = this.encryption.encrypt(JSON.stringify(input.data));
		}
		if (input.isDefault === true) {
			await this.clearDefaultForOwner(ownerId);
			updates.isDefault = true;
		} else if (input.isDefault === false) {
			updates.isDefault = false;
		}

		// WHERE includes ownerId so even a race condition cannot mutate another owner's record
		await db
			.update(llmProviderConfigs)
			.set(updates)
			.where(and(eq(llmProviderConfigs.id, id), eq(llmProviderConfigs.ownerId, ownerId)));

		return this.getById(id, ownerId);
	}

	/**
	 * Set a config as the default for its owner.
	 * Ownership is enforced at the DB level — returns null if the record does not
	 * exist or ownerId does not match.
	 */
	async setDefault(id: string, ownerId: string): Promise<LlmProviderConfig | null> {
		const existing = await this.getById(id, ownerId);
		if (!existing) return null;

		await this.clearDefaultForOwner(ownerId);
		await db
			.update(llmProviderConfigs)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(and(eq(llmProviderConfigs.id, id), eq(llmProviderConfigs.ownerId, ownerId)));

		return this.getById(id, ownerId);
	}

	/**
	 * Delete a config by ID.
	 * Ownership is enforced at the DB level — returns false if the record does not
	 * exist or ownerId does not match.
	 */
	async delete(id: string, ownerId: string): Promise<boolean> {
		const result = await db
			.delete(llmProviderConfigs)
			.where(and(eq(llmProviderConfigs.id, id), eq(llmProviderConfigs.ownerId, ownerId)));
		return (result.rowCount ?? 0) > 0;
	}

	/** Internal helper — unsets isDefault on all configs for an owner */
	private async clearDefaultForOwner(ownerId: string): Promise<void> {
		await db
			.update(llmProviderConfigs)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(and(eq(llmProviderConfigs.ownerId, ownerId), eq(llmProviderConfigs.isDefault, true)));
	}
}
