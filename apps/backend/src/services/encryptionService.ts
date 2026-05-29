import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Service responsible for encrypting and decrypting credential data
 * using AES-256-GCM with a master key from environment variables.
 */
export class EncryptionService {
  private key: Buffer;

  constructor() {
    const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!hex) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY environment variable is not set');
    }
    const key = Buffer.from(hex, 'hex');
    if (key.length !== 32) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte (64 hex character) string');
    }
    this.key = key;
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Returns a string in the format: IV:AuthTag:EncryptedPayload (all hex-encoded).
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts a ciphertext string previously produced by encrypt().
   * Expects the format: IV:AuthTag:EncryptedPayload (all hex-encoded).
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format: expected IV:AuthTag:Payload');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
