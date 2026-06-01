import { Router } from 'express';
import type { Request, Response } from 'express';
import { SkillService } from '../services/SkillService.js';
import { AgentService } from '../services/AgentService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	SkillCatalogResponse,
	AgentSkillsListResponse,
	AgentEvolvedSkillResponse,
	AgentSkillAssignResponse,
	AgentSkillRemoveResponse,
	AssignSkillRequestBody,
	RemoveSkillRequestBody,
} from '@repo/types';

const skillService = new SkillService();
const agentService = new AgentService();

/**
 * Factory — creates the skills router with an injected AuthService instance.
 *
 * Routes:
 *   GET  /v1/skills                                    — list skill catalog
 *   GET  /v1/agents/:id/skills                         — list assigned skill names
 *   POST /v1/agents/:id/skills                         — assign a skill to an agent
 *   DELETE /v1/agents/:id/skills/:skillName            — remove a skill from an agent
 *   GET  /v1/agents/:id/skills/:skillName/evolved      — get evolved instructions
 */
export function createSkillsRouter(authService: AuthService): Router {
	const router = Router();
	const auth = requireAuth(authService);

	/**
	 * GET /v1/skills
	 * Returns the full static skill catalog from the codebase.
	 */
	router.get('/', auth, (_req: Request, res: Response) => {
		const catalog = skillService.getCatalog();
		const body: SkillCatalogResponse = { success: true, data: catalog };
		res.json(body);
	});

	return router;
}

/**
 * Factory — creates the agent-scoped skills sub-router.
 * Mounted under /v1/agents/:id/skills inside createAgentsRouter.
 *
 * Note: agentId is available via req.params.id from the parent router.
 */
export function createAgentSkillsRouter(authService: AuthService): Router {
	const router = Router({ mergeParams: true });
	const auth = requireAuth(authService);

	/**
	 * GET /v1/agents/:id/skills
	 * Returns the list of skill names assigned to the agent.
	 * Requires ownerId query param for ownership check.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const ownerId = req.query.ownerId as string | undefined;
		if (!ownerId) {
			const body: AgentSkillsListResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
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
	 * Body: { ownerId, skillName }
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const { ownerId, skillName } = req.body as AssignSkillRequestBody;

		if (!ownerId || !skillName) {
			const body: AgentSkillAssignResponse = {
				success: false,
				error: 'ownerId and skillName are required',
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
			const assignment = await skillService.assignSkill(agentId, skillName);
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
	 * Body: { ownerId }
	 */
	router.delete('/:skillName', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const skillName = req.params.skillName as string;
		const { ownerId } = req.body as RemoveSkillRequestBody;

		if (!ownerId) {
			const body: AgentSkillRemoveResponse = { success: false, error: 'ownerId is required' };
			res.status(400).json(body);
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
	 * GET /v1/agents/:id/skills/:skillName/evolved
	 * Returns the agent-specific evolved skill instructions, if any.
	 */
	router.get('/:skillName/evolved', auth, async (req: Request, res: Response) => {
		const agentId = req.params.id as string;
		const skillName = req.params.skillName as string;
		const ownerId = req.query.ownerId as string | undefined;

		if (!ownerId) {
			const body: AgentEvolvedSkillResponse = {
				success: false,
				error: 'ownerId query parameter is required',
			};
			res.status(400).json(body);
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
