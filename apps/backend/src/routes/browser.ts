import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from '../services/AuthService.js';
import type { AgentService } from '../services/AgentService.js';
import type { BrowserService } from '../services/BrowserService.js';
import type {
	BrowserSessionStatusResponse,
	BrowserHistoryListResponse,
	BrowserActionResponse,
} from '@repo/types';

/**
 * Agent browser-session management (owner-facing), mounted at
 * /v1/agents/:agentId/browser (mergeParams). Lets the end user inspect and
 * manage an agent's persisted browser session (cookies/logins), visited-URL
 * history, and any live session — from the chat thread-menu modal.
 *
 * Every handler derives ownerId from req.user.sub and verifies the caller owns
 * the agent before touching any browser state. Browser cookies/logins/history
 * are per-agent (shared across the agent's threads); "close session" is per-thread.
 */
export function createAgentBrowserRouter(
	authService: AuthService,
	agentService: AgentService,
	browserService: BrowserService,
): Router {
	const router = Router({ mergeParams: true });
	const auth = requireAuth(authService);

	/**
	 * Resolve the ownership-checked agent for the request, or write the matching
	 * error response and return null. Returns the agent's id + internet-access flag.
	 */
	async function requireAgent(
		req: Request,
		res: Response,
	): Promise<{ agentId: string; allowInternetAccess: boolean } | null> {
		const agentId = (req.params as { agentId: string }).agentId;
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return null;
		}
		const agent = await agentService.getById(agentId, ownerId);
		if (!agent) {
			res.status(404).json({ success: false, error: 'Agent not found' });
			return null;
		}
		return { agentId, allowInternetAccess: agent.allowInternetAccess };
	}

	// GET /v1/agents/:agentId/browser — persisted/active/history summary
	router.get('/', auth, async (req: Request, res: Response) => {
		const ctx = await requireAgent(req, res);
		if (!ctx) return;
		const body: BrowserSessionStatusResponse = {
			success: true,
			data: browserService.getStatus(ctx.agentId, ctx.allowInternetAccess),
		};
		res.json(body);
	});

	// GET /v1/agents/:agentId/browser/history — recorded visited pages (most recent first)
	router.get('/history', auth, async (req: Request, res: Response) => {
		const ctx = await requireAgent(req, res);
		if (!ctx) return;
		const body: BrowserHistoryListResponse = {
			success: true,
			data: browserService.listHistory(ctx.agentId),
		};
		res.json(body);
	});

	// DELETE /v1/agents/:agentId/browser/session?threadId= — close a thread's live session
	// (or all of the agent's live sessions when threadId is omitted)
	router.delete('/session', auth, async (req: Request, res: Response) => {
		const ctx = await requireAgent(req, res);
		if (!ctx) return;
		const threadId = (req.query.threadId as string | undefined)?.trim();
		let closed: number;
		if (threadId) {
			closed = (await browserService.closeAgentThreadSession(ctx.agentId, threadId)) ? 1 : 0;
		} else {
			closed = await browserService.closeAgentSessions(ctx.agentId);
		}
		const body: BrowserActionResponse = { success: true, data: { ok: true, closed } };
		res.json(body);
	});

	// DELETE /v1/agents/:agentId/browser/data — clear saved logins/cookies (storageState)
	router.delete('/data', auth, async (req: Request, res: Response) => {
		const ctx = await requireAgent(req, res);
		if (!ctx) return;
		await browserService.clearLoginData(ctx.agentId);
		const body: BrowserActionResponse = { success: true, data: { ok: true } };
		res.json(body);
	});

	// DELETE /v1/agents/:agentId/browser/history — clear recorded history
	router.delete('/history', auth, async (req: Request, res: Response) => {
		const ctx = await requireAgent(req, res);
		if (!ctx) return;
		browserService.clearHistory(ctx.agentId);
		const body: BrowserActionResponse = { success: true, data: { ok: true } };
		res.json(body);
	});

	// DELETE /v1/agents/:agentId/browser — full reset (session + logins + history)
	router.delete('/', auth, async (req: Request, res: Response) => {
		const ctx = await requireAgent(req, res);
		if (!ctx) return;
		await browserService.resetBrowser(ctx.agentId);
		const body: BrowserActionResponse = { success: true, data: { ok: true } };
		res.json(body);
	});

	return router;
}
