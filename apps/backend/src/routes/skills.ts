import { Router } from 'express';
import type { Request, Response } from 'express';
import { SkillService } from '../services/SkillService.js';
import { SkillInstallService, SkillInstallError } from '../services/SkillInstallService.js';
import { AgentService } from '../services/AgentService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	SkillCatalogResponse,
	AgentSkillsListResponse,
	AgentEvolvedSkillResponse,
	AgentEvolvedSkillsListResponse,
	AgentSkillAssignResponse,
	AgentSkillRemoveResponse,
	AssignSkillRequestBody,
	SkillInstallPreviewRequestBody,
	SkillInstallPreviewResponse,
	SkillInstallConfirmRequestBody,
	InstalledSkillResponse,
	InstalledSkillsListResponse,
	InstalledSkillDeleteResponse,
	InstalledSkillFilesResponse,
} from '@repo/types';

/**
 * Factory — creates the skills router with injected service instances.
 *
 * Routes (all requireAuth; ownerId comes from the authenticated token — never
 * from the client):
 *   GET    /v1/skills                       — merged catalog (builtin + owner's installed)
 *   GET    /v1/skills/installed             — owner's installed skills
 *   GET    /v1/skills/installed/:id/files   — bundle file contents (review/detail view)
 *   POST   /v1/skills/install/preview       — fetch + validate + scan a GitHub skill
 *   POST   /v1/skills/install/confirm       — persist a previously previewed bundle
 *   DELETE /v1/skills/installed/:id         — uninstall (cascades assignments)
 */
export function createSkillsRouter(
	authService: AuthService,
	skillService: SkillService,
	skillInstallService: SkillInstallService,
): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * GET /v1/skills
	 * Returns the merged skill catalog: builtin skills + the owner's installed skills.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: SkillCatalogResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		try {
			const catalog = await skillService.getCatalog(ownerId);
			const body: SkillCatalogResponse = { success: true, data: catalog };
			res.json(body);
		} catch (err) {
			logger.error({ err }, 'Failed to load skill catalog');
			const body: SkillCatalogResponse = { success: false, error: 'Failed to load skill catalog' };
			res.status(500).json(body);
		}
	});

	/**
	 * GET /v1/skills/installed
	 * Lists the owner's installed skills with full provenance metadata.
	 */
	router.get('/installed', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: InstalledSkillsListResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		try {
			const installed = await skillService.listInstalled(ownerId);
			const body: InstalledSkillsListResponse = { success: true, data: installed };
			res.json(body);
		} catch (err) {
			logger.error({ err }, 'Failed to list installed skills');
			const body: InstalledSkillsListResponse = {
				success: false,
				error: 'Failed to list installed skills',
			};
			res.status(500).json(body);
		}
	});

	/**
	 * GET /v1/skills/installed/:id/files
	 * Returns the bundle file contents of an installed skill (ownership-checked).
	 */
	router.get('/installed/:id/files', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: InstalledSkillFilesResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		try {
			const skill = await skillService.getInstalledById(req.params.id as string, ownerId);
			if (!skill) {
				const body: InstalledSkillFilesResponse = { success: false, error: 'Skill not found' };
				res.status(404).json(body);
				return;
			}
			const files = await skillService.getInstalledFiles(skill.id);
			const body: InstalledSkillFilesResponse = { success: true, data: files };
			res.json(body);
		} catch (err) {
			logger.error({ err }, 'Failed to load skill files');
			const body: InstalledSkillFilesResponse = {
				success: false,
				error: 'Failed to load skill files',
			};
			res.status(500).json(body);
		}
	});

	/**
	 * POST /v1/skills/install/preview
	 * Fetches a skill from GitHub, validates it, runs the security scan, and
	 * returns the full preview for human review. Block-level failures → 422.
	 */
	router.post('/install/preview', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: SkillInstallPreviewResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const { repoUrl, subpath, ref } = req.body as SkillInstallPreviewRequestBody;
		if (!repoUrl || typeof repoUrl !== 'string') {
			const body: SkillInstallPreviewResponse = { success: false, error: 'repoUrl is required' };
			res.status(400).json(body);
			return;
		}

		try {
			const preview = await skillInstallService.preview(ownerId, repoUrl, subpath, ref);
			const body: SkillInstallPreviewResponse = { success: true, data: preview };
			res.json(body);
		} catch (err) {
			if (err instanceof SkillInstallError) {
				const body: SkillInstallPreviewResponse = { success: false, error: err.message };
				res.status(422).json(body);
				return;
			}
			logger.error({ err, repoUrl }, 'Skill install preview failed');
			const body: SkillInstallPreviewResponse = {
				success: false,
				error: 'Failed to fetch the skill from GitHub',
			};
			res.status(500).json(body);
		}
	});

	/**
	 * POST /v1/skills/install/confirm
	 * Persists the exact bundle the user reviewed (from the server-side preview cache).
	 */
	router.post('/install/confirm', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: InstalledSkillResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const { previewId } = req.body as SkillInstallConfirmRequestBody;
		if (!previewId || typeof previewId !== 'string') {
			const body: InstalledSkillResponse = { success: false, error: 'previewId is required' };
			res.status(400).json(body);
			return;
		}

		try {
			const installed = await skillInstallService.confirm(previewId, ownerId);
			const body: InstalledSkillResponse = { success: true, data: installed };
			res.status(201).json(body);
		} catch (err) {
			if (err instanceof SkillInstallError) {
				const body: InstalledSkillResponse = { success: false, error: err.message };
				res.status(422).json(body);
				return;
			}
			logger.error({ err }, 'Skill install confirm failed');
			const body: InstalledSkillResponse = { success: false, error: 'Failed to install skill' };
			res.status(500).json(body);
		}
	});

	/**
	 * DELETE /v1/skills/installed/:id
	 * Uninstalls a skill. agent_skills assignments cascade via FK; evolved
	 * records are cleaned up by the service.
	 */
	router.delete('/installed/:id', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: InstalledSkillDeleteResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		try {
			const result = await skillService.deleteInstalled(req.params.id as string, ownerId);
			if (!result) {
				const body: InstalledSkillDeleteResponse = { success: false, error: 'Skill not found' };
				res.status(404).json(body);
				return;
			}
			const body: InstalledSkillDeleteResponse = { success: true, data: result };
			res.json(body);
		} catch (err) {
			logger.error({ err }, 'Failed to delete installed skill');
			const body: InstalledSkillDeleteResponse = {
				success: false,
				error: 'Failed to delete skill',
			};
			res.status(500).json(body);
		}
	});

	return router;
}

/**
 * Factory — creates the agent-scoped skills sub-router.
 * Mounted under /v1/agents/:id/skills inside createAgentsRouter.
 *
 * Note: agentId is available via req.params.id from the parent router.
 * ownerId always comes from the authenticated token (req.user.sub) — never
 * from the client — so users can only act on agents they own.
 */
export function createAgentSkillsRouter(
	authService: AuthService,
	skillService: SkillService,
	agentService: AgentService,
): Router {
	const router = Router({ mergeParams: true });
	const auth = requireAuth(authService);

	/**
	 * GET /v1/agents/:id/skills
	 * Returns the list of skill names assigned to the agent.
	 * Ownership is checked against the authenticated user.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: AgentSkillsListResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		// Ownership check
		const agent = await agentService.getById(agentId, ownerId);
		if (!agent) {
			const body: AgentSkillsListResponse = { success: false, error: 'Agent not found' };
			res.status(404).json(body);
			return;
		}

		const skillNames = await skillService.getAgentSkills(agentId);
		const body: AgentSkillsListResponse = { success: true, data: skillNames };
		res.json(body);
	});

	/**
	 * POST /v1/agents/:id/skills
	 * Assigns a skill to an agent.
	 * Body: { skillName }
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: AgentSkillAssignResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const { skillName } = req.body as AssignSkillRequestBody;
		if (!skillName) {
			const body: AgentSkillAssignResponse = {
				success: false,
				error: 'skillName is required',
			};
			res.status(400).json(body);
			return;
		}

		// Ownership check
		const agent = await agentService.getById(agentId, ownerId);
		if (!agent) {
			const body: AgentSkillAssignResponse = { success: false, error: 'Agent not found' };
			res.status(404).json(body);
			return;
		}

		try {
			const assignment = await skillService.assignSkill(agentId, skillName, ownerId);
			if (!assignment) {
				const body: AgentSkillAssignResponse = {
					success: false,
					error: `Skill "${skillName}" not found in catalog`,
				};
				res.status(404).json(body);
				return;
			}
			const body: AgentSkillAssignResponse = { success: true, data: assignment };
			res.status(201).json(body);
		} catch (err) {
			logger.error({ err }, 'Failed to assign skill');
			const body: AgentSkillAssignResponse = { success: false, error: 'Failed to assign skill' };
			res.status(500).json(body);
		}
	});

	/**
	 * DELETE /v1/agents/:id/skills/:skillName
	 * Removes a skill assignment from an agent.
	 */
	router.delete('/:skillName', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const skillName = req.params.skillName as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: AgentSkillRemoveResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		// Ownership check
		const agent = await agentService.getById(agentId, ownerId);
		if (!agent) {
			const body: AgentSkillRemoveResponse = { success: false, error: 'Agent not found' };
			res.status(404).json(body);
			return;
		}

		const removed = await skillService.removeSkill(agentId, skillName);
		if (!removed) {
			const body: AgentSkillRemoveResponse = {
				success: false,
				error: 'Skill assignment not found',
			};
			res.status(404).json(body);
			return;
		}

		const body: AgentSkillRemoveResponse = { success: true, data: { removed: true } };
		res.json(body);
	});

	/**
	 * GET /v1/agents/:id/skills/evolved
	 * Returns ALL evolved skill records for the agent (one query — used by the
	 * agent edit page to populate the skills panel).
	 */
	router.get('/evolved', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: AgentEvolvedSkillsListResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		// Ownership check
		const agent = await agentService.getById(agentId, ownerId);
		if (!agent) {
			const body: AgentEvolvedSkillsListResponse = { success: false, error: 'Agent not found' };
			res.status(404).json(body);
			return;
		}

		const evolved = await skillService.getEvolvedSkills(agentId);
		const body: AgentEvolvedSkillsListResponse = { success: true, data: evolved };
		res.json(body);
	});

	/**
	 * GET /v1/agents/:id/skills/:skillName/evolved
	 * Returns the agent-specific evolved skill instructions, if any.
	 */
	router.get('/:skillName/evolved', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const skillName = req.params.skillName as string;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: AgentEvolvedSkillResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		// Ownership check
		const agent = await agentService.getById(agentId, ownerId);
		if (!agent) {
			const body: AgentEvolvedSkillResponse = { success: false, error: 'Agent not found' };
			res.status(404).json(body);
			return;
		}

		const evolved = await skillService.getEvolvedSkill(agentId, skillName);
		if (!evolved) {
			const body: AgentEvolvedSkillResponse = {
				success: false,
				error: 'No evolved skill found for this agent and skill',
			};
			res.status(404).json(body);
			return;
		}

		const body: AgentEvolvedSkillResponse = { success: true, data: evolved };
		res.json(body);
	});

	return router;
}
