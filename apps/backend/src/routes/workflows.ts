import { Router } from 'express';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthService } from '../services/AuthService.js';
import { WorkflowService } from '../services/WorkflowService.js';
import { WorkflowRunService } from '../services/WorkflowRunService.js';
import { TriggerService } from '../services/TriggerService.js';
import { requireAuth } from '../middleware/auth.js';
import type { WorkflowStep, WorkflowTriggerInput } from '@repo/types';

/**
 * Returns a structured 422 response body with all ZodError issues.
 * Each issue includes the field path, error code, and human-readable message.
 */
function handleZodError(err: ZodError, res: Response): void {
	res.status(422).json({
		success: false,
		error: 'Validation failed',
		issues: err.issues.map((issue) => ({
			path: issue.path.join('.'),
			code: issue.code,
			message: issue.message,
		})),
	});
}

/**
 * Workflow routes — CRUD for workflow definitions and listing runs/step logs.
 *
 * All routes are scoped to an agent:
 *   POST   /v1/agents/:agentId/workflows            — create a workflow (always provisions a trigger)
 *   GET    /v1/agents/:agentId/workflows            — list workflows for an agent (includes trigger)
 *   GET    /v1/agents/:agentId/workflows/:id        — get a single workflow (includes trigger)
 *   PUT    /v1/agents/:agentId/workflows/:id        — update a workflow (optionally update trigger)
 *   DELETE /v1/agents/:agentId/workflows/:id        — delete workflow and its trigger
 *   GET    /v1/agents/:agentId/workflows/:id/runs   — list runs for a workflow
 *   GET    /v1/agents/:agentId/workflows/:id/runs/:runId/steps — get step logs for a run
 *
 * Mounted at /v1/agents/:agentId/workflows in index.ts via mergeParams: true.
 *
 * TriggerService is accepted here (not in WorkflowService) to close the gap where
 * WorkflowService writes cron triggers directly to DB but cannot call
 * TriggerService.scheduleCron() due to a circular dependency.
 * After every create / update / delete we call scheduleFromWorkflow /
 * unscheduleFromWorkflow so cron jobs are active immediately — no restart required.
 */
export function createWorkflowsRouter(
	authService: AuthService,
	workflowService: WorkflowService,
	workflowRunService: WorkflowRunService,
	triggerService: TriggerService,
): Router {
	const router = Router({ mergeParams: true });
	const auth = requireAuth(authService);

	/**
	 * POST /v1/agents/:agentId/workflows
	 * Create a new workflow for the agent.
	 * A trigger is always provisioned — defaults to manual if not specified.
	 * Optionally pass `trigger: { kind, name, config, description }` in the body.
	 * If the trigger kind is 'cron', the cron job is registered in-memory immediately.
	 */
	router.post('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { agentId } = req.params as { agentId: string };
		const { name, description, steps, isEnabled, trigger } = req.body as {
			name: string;
			description?: string;
			steps: WorkflowStep[];
			isEnabled?: boolean;
			trigger?: WorkflowTriggerInput;
		};

		try {
			const workflow = await workflowService.create({
				agentId,
				ownerId,
				name,
				description,
				steps,
				isEnabled,
				trigger,
			});

			// Schedule the cron job immediately if the new trigger is of kind 'cron'.
			// WorkflowService cannot do this itself (circular dep), so we do it here.
			if (workflow.trigger) {
				triggerService.scheduleFromWorkflow(workflow.trigger);
			}

			res.status(201).json({ success: true, data: workflow });
		} catch (err) {
			if (err instanceof ZodError) {
				handleZodError(err, res);
				return;
			}
			throw err;
		}
	});

	/**
	 * GET /v1/agents/:agentId/workflows
	 * List all workflows for the agent including their trigger information.
	 */
	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { agentId } = req.params as { agentId: string };

		const workflows = await workflowService.listByAgent(agentId, ownerId);
		res.json({ success: true, data: workflows });
	});

	/**
	 * GET /v1/agents/:agentId/workflows/:id
	 * Get a single workflow by ID including its trigger information.
	 */
	router.get('/:id', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { id } = req.params as { id: string };

		const workflow = await workflowService.getById(id, ownerId);
		if (!workflow) {
			res.status(404).json({ success: false, error: 'Workflow not found' });
			return;
		}
		res.json({ success: true, data: workflow });
	});

	/**
	 * PUT /v1/agents/:agentId/workflows/:id
	 * Update a workflow — all fields optional, steps are fully replaced if provided.
	 * Optionally pass `trigger: { kind, name, config, description }` to update the trigger.
	 * If the trigger kind changed to/from cron the in-memory scheduler is updated immediately.
	 */
	router.put('/:id', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { id } = req.params as { id: string };
		const { name, description, steps, isEnabled, trigger } = req.body as {
			name?: string;
			description?: string;
			steps?: WorkflowStep[];
			isEnabled?: boolean;
			trigger?: WorkflowTriggerInput;
		};

		// Capture the old trigger ID before update so we can unschedule it when kind changes.
		const existing = await workflowService.getById(id, ownerId);

		try {
			const updated = await workflowService.update(id, ownerId, {
				name,
				description,
				steps,
				isEnabled,
				trigger,
			});
			if (!updated) {
				res.status(404).json({ success: false, error: 'Workflow not found' });
				return;
			}

			// Sync in-memory cron scheduler:
			// 1. Always unschedule the old trigger job (handles kind changes and id changes).
			if (existing?.trigger) {
				triggerService.unscheduleFromWorkflow(existing.trigger.id);
			}
			// 2. Only schedule the updated cron if the workflow itself is also enabled.
			//    When isEnabled=false is passed on the workflow, the cron must not fire
			//    even though the trigger row's own isEnabled remains true.
			if (updated.trigger && updated.isEnabled) {
				triggerService.scheduleFromWorkflow(updated.trigger);
			}

			res.json({ success: true, data: updated });
		} catch (err) {
			if (err instanceof ZodError) {
				handleZodError(err, res);
				return;
			}
			throw err;
		}
	});

	/**
	 * DELETE /v1/agents/:agentId/workflows/:id
	 * Delete a workflow and its associated trigger.
	 * The cron job (if any) is unscheduled immediately from memory.
	 */
	router.delete('/:id', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { id } = req.params as { id: string };

		// Fetch the workflow first so we know the trigger ID to unschedule.
		const existing = await workflowService.getById(id, ownerId);

		const deleted = await workflowService.delete(id, ownerId);
		if (!deleted) {
			res.status(404).json({ success: false, error: 'Workflow not found' });
			return;
		}

		// Remove the cron job from memory immediately (WorkflowService cannot do this).
		if (existing?.trigger) {
			triggerService.unscheduleFromWorkflow(existing.trigger.id);
		}

		res.json({ success: true, data: { deleted: true } });
	});

	/**
	 * GET /v1/agents/:agentId/workflows/:id/runs
	 * List runs for a workflow with optional pagination.
	 * Query params: limit (default 20), offset (default 0)
	 */
	router.get('/:id/runs', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { id } = req.params as { id: string };

		// Verify workflow ownership before listing runs
		const workflow = await workflowService.getById(id, ownerId);
		if (!workflow) {
			res.status(404).json({ success: false, error: 'Workflow not found' });
			return;
		}

		const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);
		const offset = parseInt((req.query.offset as string) ?? '0', 10);

		const result = await workflowRunService.listRuns(id, ownerId, limit, offset);
		res.json({ success: true, data: result });
	});

	/**
	 * GET /v1/agents/:agentId/workflows/:id/runs/:runId/steps
	 * Get step logs for a specific run.
	 */
	router.get('/:id/runs/:runId/steps', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { runId } = req.params as { runId: string };

		const stepLogs = await workflowRunService.getStepLogs(runId, ownerId);
		res.json({ success: true, data: stepLogs });
	});

	return router;
}

/**
 * Global workflow routes — owner-wide listing across all agents.
 *
 *   GET /v1/workflows            — list every workflow for the authenticated owner
 *   GET /v1/workflows?agentId=x  — filter the list to a single agent
 *
 * Mounted at /v1/workflows in index.ts. Create/update/delete remain on the
 * agent-scoped router above — workflows are always managed under an agent.
 */
export function createGlobalWorkflowsRouter(
	authService: AuthService,
	workflowService: WorkflowService,
): Router {
	const router = Router();
	const auth = requireAuth(authService);

	router.get('/', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;

		const workflows = await workflowService.listByOwner(ownerId, agentId);
		res.json({ success: true, data: workflows });
	});

	return router;
}
