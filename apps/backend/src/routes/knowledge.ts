import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { AuthService } from '../services/AuthService.js';
import {
	KnowledgeBaseService,
	MAX_KNOWLEDGE_FILE_BYTES,
	type KnowledgeUploadInput,
} from '../services/KnowledgeBaseService.js';
import { CredentialService } from '../services/CredentialService.js';
import type { CloudProviderRegistry } from '../services/knowledge/providerRegistry.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import type {
	AgentKnowledgeAssignResponse,
	AgentKnowledgeListResponse,
	AgentKnowledgeReprocessResponse,
	AgentKnowledgeUnassignResponse,
	AssignKnowledgeRequestBody,
	CloudFileBrowseResponse,
	KnowledgeFileDeleteResponse,
	KnowledgeFilesListResponse,
	KnowledgeImportRequestBody,
	KnowledgeImportResponse,
	KnowledgeProviderInfo,
	KnowledgeProvidersResponse,
} from '@repo/types';

const MAX_UPLOAD_FILES_PER_REQUEST = 10;

/**
 * Knowledge library routes — user-level files and cloud-provider browsing.
 *
 *   GET    /v1/knowledge/files                       — list the user's library
 *   POST   /v1/knowledge/files/upload                — multipart upload (field name: files)
 *   POST   /v1/knowledge/files/import                — import files from a cloud provider
 *   DELETE /v1/knowledge/files/:fileId               — delete a file (cascades agent chunks)
 *   GET    /v1/knowledge/providers                   — providers + the user's compatible credentials
 *   GET    /v1/knowledge/providers/:providerId/files — browse cloud files
 */
export function createKnowledgeRouter(
	authService: AuthService,
	knowledgeBaseService: KnowledgeBaseService,
	providerRegistry: CloudProviderRegistry,
	credentialService: CredentialService,
): Router {
	const router = Router();
	const auth = requireAuth(authService);

	const upload = multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: MAX_KNOWLEDGE_FILE_BYTES, files: MAX_UPLOAD_FILES_PER_REQUEST },
	});

	router.get('/files', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const files = await knowledgeBaseService.listFiles(ownerId);
		const body: KnowledgeFilesListResponse = { success: true, data: files };
		res.json(body);
	});

	/**
	 * POST /v1/knowledge/files/upload
	 * Multipart upload — accepts up to 10 files in the `files` field, 20MB each.
	 * Returns the created rows immediately; extraction runs in the background.
	 */
	router.post('/files/upload', auth, (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		upload.array('files', MAX_UPLOAD_FILES_PER_REQUEST)(req, res, async (err?: unknown) => {
			if (err) {
				const message =
					err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
						? `File exceeds the ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)}MB limit.`
						: err instanceof Error
							? err.message
							: 'Upload failed.';
				res.status(400).json({ success: false, error: message });
				return;
			}

			const files = (req.files ?? []) as Express.Multer.File[];
			if (files.length === 0) {
				res.status(400).json({ success: false, error: 'No files uploaded.' });
				return;
			}

			const uploads: KnowledgeUploadInput[] = files.map((file) => ({
				// Multer decodes the original name as latin1 — re-decode as UTF-8
				name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
				mimeType: file.mimetype,
				sizeBytes: file.size,
				data: file.buffer,
			}));

			try {
				const created = await knowledgeBaseService.createFromUploads(ownerId, uploads);
				const body: KnowledgeImportResponse = { success: true, data: created };
				res.status(201).json(body);
			} catch (uploadErr) {
				const message = uploadErr instanceof Error ? uploadErr.message : 'Upload failed.';
				res.status(400).json({ success: false, error: message });
			}
		});
	});

	/**
	 * POST /v1/knowledge/files/import
	 * Import selected files from a cloud provider. Download + extraction run in
	 * the background; rows are returned immediately with status 'pending'.
	 */
	router.post('/files/import', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const body = req.body as KnowledgeImportRequestBody;
		if (!body.provider || !body.credentialId || !Array.isArray(body.files)) {
			res
				.status(400)
				.json({ success: false, error: 'provider, credentialId and files are required.' });
			return;
		}

		try {
			const created = await knowledgeBaseService.importFromCloud(ownerId, body);
			const responseBody: KnowledgeImportResponse = { success: true, data: created };
			res.status(201).json(responseBody);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Import failed.';
			res.status(400).json({ success: false, error: message });
		}
	});

	/**
	 * DELETE /v1/knowledge/files/:fileId
	 * Delete a library file. Cascades to all agent assignments and their chunks.
	 */
	router.delete('/files/:fileId', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { fileId } = req.params as { fileId: string };

		const result = await knowledgeBaseService.deleteFile(fileId, ownerId);
		if (!result) {
			res.status(404).json({ success: false, error: 'Knowledge file not found' });
			return;
		}
		const body: KnowledgeFileDeleteResponse = {
			success: true,
			data: { deleted: true, affectedAgents: result.affectedAgents },
		};
		res.json(body);
	});

	/**
	 * GET /v1/knowledge/providers
	 * List cloud providers with the authenticated user's compatible credentials.
	 */
	router.get('/providers', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const credentials = await credentialService.listByOwner(ownerId);
		const data: KnowledgeProviderInfo[] = providerRegistry.getAll().map((provider) => ({
			id: provider.id,
			displayName: provider.displayName,
			icon: provider.icon,
			compatibleCredentialTypes: provider.compatibleCredentialTypes,
			credentials: credentials
				.filter((credential) => providerRegistry.isCompatible(provider, credential.type))
				.map((credential) => ({
					id: credential.id,
					name: credential.name,
					type: credential.type,
				})),
		}));
		const body: KnowledgeProvidersResponse = { success: true, data };
		res.json(body);
	});

	/**
	 * GET /v1/knowledge/providers/:providerId/files
	 * Browse a cloud provider's files. Query: credentialId (required), folderId,
	 * pageToken, search. Credential ownership + compatibility are verified
	 * before the provider is called.
	 */
	router.get('/providers/:providerId/files', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { providerId } = req.params as { providerId: string };
		const { credentialId, folderId, pageToken, search } = req.query as {
			credentialId?: string;
			folderId?: string;
			pageToken?: string;
			search?: string;
		};

		const provider = providerRegistry.getById(providerId);
		if (!provider) {
			res.status(404).json({ success: false, error: 'Unknown provider' });
			return;
		}
		if (!credentialId) {
			res.status(400).json({ success: false, error: 'credentialId is required' });
			return;
		}
		const credential = await credentialService.getById(credentialId, ownerId);
		if (!credential) {
			res.status(404).json({ success: false, error: 'Credential not found' });
			return;
		}
		if (!providerRegistry.isCompatible(provider, credential.type)) {
			res.status(400).json({
				success: false,
				error: `Credential type '${credential.type}' is not compatible with provider '${provider.id}'.`,
			});
			return;
		}

		try {
			const result = await provider.list(
				{ credentialId, ownerId },
				{ folderId, pageToken, search },
			);
			const body: CloudFileBrowseResponse = { success: true, data: result };
			res.json(body);
		} catch (err) {
			logger.warn({ err, providerId }, '[knowledge] cloud browse failed');
			const message = err instanceof Error ? err.message : 'Cloud provider request failed.';
			res.status(502).json({ success: false, error: message });
		}
	});

	return router;
}

/**
 * Agent knowledge assignment routes — mounted at /v1/agents/:agentId/knowledge
 * (mergeParams, same pattern as workflows).
 *
 *   GET    /v1/agents/:agentId/knowledge                          — list assignments
 *   POST   /v1/agents/:agentId/knowledge                          — assign library files
 *   POST   /v1/agents/:agentId/knowledge/:assignmentId/reprocess  — re-chunk + re-embed
 *   DELETE /v1/agents/:agentId/knowledge/:assignmentId            — unassign (cascades chunks)
 */
export function createAgentKnowledgeRouter(
	authService: AuthService,
	knowledgeBaseService: KnowledgeBaseService,
): Router {
	const router = Router({ mergeParams: true });
	const auth = requireAuth(authService);

	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { agentId } = req.params as { agentId: string };

		const assignments = await knowledgeBaseService.listAssignments(agentId, ownerId);
		const body: AgentKnowledgeListResponse = { success: true, data: assignments };
		res.json(body);
	});

	/**
	 * POST /v1/agents/:agentId/knowledge
	 * Assign library files to the agent. Idempotent for already-assigned files.
	 * Ingestion (chunk + embed) runs in the background — 202 Accepted.
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { agentId } = req.params as { agentId: string };
		const { knowledgeFileIds } = req.body as AssignKnowledgeRequestBody;
		if (!Array.isArray(knowledgeFileIds)) {
			res.status(400).json({ success: false, error: 'knowledgeFileIds must be an array.' });
			return;
		}

		try {
			const assignments = await knowledgeBaseService.assign(agentId, ownerId, knowledgeFileIds);
			const body: AgentKnowledgeAssignResponse = { success: true, data: assignments };
			res.status(202).json(body);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Assignment failed.';
			const status = message === 'Agent not found.' ? 404 : 400;
			res.status(status).json({ success: false, error: message });
		}
	});

	/**
	 * POST /v1/agents/:agentId/knowledge/:assignmentId/reprocess
	 * Re-chunk + re-embed from stored segments — the recovery path after an
	 * embedding-model change or a transient failure. 409 while already processing.
	 */
	router.post('/:assignmentId/reprocess', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { agentId, assignmentId } = req.params as { agentId: string; assignmentId: string };

		try {
			const assignment = await knowledgeBaseService.reprocessAssignment(
				assignmentId,
				agentId,
				ownerId,
			);
			if (!assignment) {
				res.status(404).json({ success: false, error: 'Assignment not found' });
				return;
			}
			const body: AgentKnowledgeReprocessResponse = { success: true, data: assignment };
			res.status(202).json(body);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Reprocess failed.';
			const status = message === 'Assignment is already processing.' ? 409 : 400;
			res.status(status).json({ success: false, error: message });
		}
	});

	router.delete('/:assignmentId', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { agentId, assignmentId } = req.params as { agentId: string; assignmentId: string };

		const removed = await knowledgeBaseService.unassign(agentId, ownerId, assignmentId);
		if (!removed) {
			res.status(404).json({ success: false, error: 'Assignment not found' });
			return;
		}
		const body: AgentKnowledgeUnassignResponse = { success: true, data: { removed: true } };
		res.json(body);
	});

	return router;
}
