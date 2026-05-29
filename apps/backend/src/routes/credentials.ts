import { Router } from 'express';
import type { Request, Response } from 'express';
import { loadCredentialDefinitions, getCredentialDefinition } from '@repo/utils';
import { EncryptionService } from '../services/encryptionService.js';
import { CredentialService } from '../services/credentialService.js';

const encryption = new EncryptionService();
const credentialService = new CredentialService(encryption);

export const credentialsRouter = Router();

/**
 * GET /credentials/definitions
 * Returns all available credential definitions (from YAML registry).
 */
credentialsRouter.get('/definitions', (_req: Request, res: Response) => {
  const definitions = loadCredentialDefinitions();
  res.json({ success: true, data: definitions });
});

/**
 * GET /credentials/definitions/:id
 * Returns a single credential definition by its YAML id.
 */
credentialsRouter.get('/definitions/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const definition = getCredentialDefinition(id);
  if (!definition) {
    res.status(404).json({ success: false, error: 'Definition not found' });
    return;
  }
  res.json({ success: true, data: definition });
});

/**
 * GET /credentials
 * List all credential instances for a given owner.
 * Requires `ownerId` query parameter.
 */
credentialsRouter.get('/', async (req: Request, res: Response) => {
  const ownerId = req.query.ownerId as string | undefined;
  if (!ownerId) {
    res.status(400).json({ success: false, error: 'ownerId query parameter is required' });
    return;
  }

  const credentials = await credentialService.listByOwner(ownerId);
  res.json({ success: true, data: credentials });
});

/**
 * GET /credentials/:id
 * Get a single credential's metadata (no decrypted data).
 */
credentialsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const credential = await credentialService.getById(id);
  if (!credential) {
    res.status(404).json({ success: false, error: 'Credential not found' });
    return;
  }
  res.json({ success: true, data: credential });
});

/**
 * POST /credentials
 * Create a new credential instance.
 * Body: { ownerId, name, type, data }
 */
credentialsRouter.post('/', async (req: Request, res: Response) => {
  const { ownerId, name, type, data } = req.body as {
    ownerId?: string;
    name?: string;
    type?: string;
    data?: Record<string, unknown>;
  };

  if (!ownerId || !name || !type || !data) {
    res.status(400).json({ success: false, error: 'ownerId, name, type, and data are required' });
    return;
  }

  // Validate that the type matches a known definition
  const definition = getCredentialDefinition(type);
  if (!definition) {
    res.status(400).json({ success: false, error: `Unknown credential type: ${type}` });
    return;
  }

  // Validate required properties
  const missingProps = definition.properties
    .filter((p) => p.required && !(p.name in data))
    .map((p) => p.displayName);

  if (missingProps.length > 0) {
    res.status(400).json({
      success: false,
      error: `Missing required properties: ${missingProps.join(', ')}`,
    });
    return;
  }

  const credential = await credentialService.create({ ownerId, name, type, data });
  res.status(201).json({ success: true, data: credential });
});

/**
 * PUT /credentials/:id
 * Update an existing credential (name and/or data).
 * Body: { name?, data? }
 */
credentialsRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, data } = req.body as {
    name?: string;
    data?: Record<string, unknown>;
  };

  if (!name && !data) {
    res.status(400).json({ success: false, error: 'At least one of name or data is required' });
    return;
  }

  const updateId = req.params.id as string;
  const updated = await credentialService.update(updateId, { name, data });
  if (!updated) {
    res.status(404).json({ success: false, error: 'Credential not found' });
    return;
  }

  res.json({ success: true, data: updated });
});

/**
 * DELETE /credentials/:id
 * Delete a credential by ID.
 */
credentialsRouter.delete('/:id', async (req: Request, res: Response) => {
  const deleteId = req.params.id as string;
  const deleted = await credentialService.delete(deleteId);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Credential not found' });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
});
