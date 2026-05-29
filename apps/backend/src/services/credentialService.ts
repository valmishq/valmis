import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { credentials } from '../db/schema/index.js';
import { EncryptionService } from './encryptionService.js';

/** Shape of a credential row without the encrypted data payload */
export interface CredentialMetadata {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}

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

  /** Get a single credential's metadata by ID */
  async getById(id: string): Promise<CredentialMetadata | null> {
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
      .where(eq(credentials.id, id))
      .limit(1);

    return rows[0] ?? null;
  }

  /** Get the decrypted data payload for a credential */
  async getDecryptedData(id: string): Promise<Record<string, unknown> | null> {
    const rows = await db
      .select({ data: credentials.data })
      .from(credentials)
      .where(eq(credentials.id, id))
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

    return { id, ownerId: input.ownerId, name: input.name, type: input.type, createdAt: now, updatedAt: now };
  }

  /** Update an existing credential (name and/or re-encrypted data) */
  async update(id: string, input: UpdateCredentialInput): Promise<CredentialMetadata | null> {
    const existing = await this.getById(id);
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

    await db.update(credentials).set(updates).where(eq(credentials.id, id));

    const updated = await this.getById(id);
    return updated;
  }

  /** Update only the encrypted data payload (used by OAuth token refresh) */
  async updateData(id: string, data: Record<string, unknown>): Promise<void> {
    const encryptedData = this.encryption.encrypt(JSON.stringify(data));
    await db
      .update(credentials)
      .set({ data: encryptedData, updatedAt: new Date() })
      .where(eq(credentials.id, id));
  }

  /** Delete a credential by ID */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(credentials).where(eq(credentials.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}
