import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type { AgentSessionService } from '../services/AgentSessionService.js';
import type { WorkflowRunService } from '../services/WorkflowRunService.js';
import type { ActivityItem, DashboardActivityResponse } from '@repo/types';

/**
 * Factory — dashboard aggregation routes.
 *
 * All routes requireAuth; ownerId comes from the authenticated token
 * (req.user.sub) — never from the client.
 *
 * Routes:
 *   GET /v1/dashboard/activity?limit=N
 *     Owner-scoped "recent activity" feed = recent interactive chat threads +
 *     recent workflow runs across all the owner's agents, merged and sorted by
 *     recency (newest first).
 */
export function createDashboardRouter(
	authService: AuthService,
	sessionService: AgentSessionService,
	workflowRunService: WorkflowRunService,
): Router {
	const router = Router();
	const auth = requireAuth(authService);

	router.get('/activity', auth, async (req: Request, res: Response) => {
		const ownerId = req.user?.sub;
		if (!ownerId) {
			const body: DashboardActivityResponse = { success: false, error: 'Unauthorized' };
			res.status(401).json(body);
			return;
		}

		const parsed = parseInt((req.query.limit as string) ?? '8', 10);
		const limit = Math.min(Number.isFinite(parsed) ? parsed : 8, 50);

		try {
			// Pull the most recent N of each source, merge, then take the newest N overall.
			const [threads, runs] = await Promise.all([
				sessionService.listRecentChatThreadsByOwner(ownerId, limit),
				workflowRunService.listRecentByOwner(ownerId, limit),
			]);

			const items: ActivityItem[] = [
				...threads.map(
					(t): ActivityItem => ({
						kind: 'chat',
						id: t.id,
						agentId: t.agentId,
						agentName: t.agentName,
						title: t.title ?? undefined,
						status: t.status,
						timestamp: t.updatedAt,
					}),
				),
				...runs.map(
					(r): ActivityItem => ({
						kind: 'workflow_run',
						id: r.id,
						workflowId: r.workflowId,
						workflowName: r.workflowName,
						agentId: r.agentId,
						agentName: r.agentName,
						status: r.status,
						error: r.error ?? undefined,
						timestamp: r.startedAt,
					}),
				),
			];

			items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

			const body: DashboardActivityResponse = { success: true, data: items.slice(0, limit) };
			res.json(body);
		} catch (err) {
			logger.error({ err, ownerId }, 'Failed to load dashboard activity');
			const body: DashboardActivityResponse = { success: false, error: 'Failed to load activity' };
			res.status(500).json(body);
		}
	});

	return router;
}
