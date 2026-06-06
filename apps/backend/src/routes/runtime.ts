import { Router } from 'express';
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { AgentSessionService } from '../services/AgentSessionService.js';
import { AgentRuntimeService } from '../services/AgentRuntimeService.js';
import { AgentProxyService } from '../services/AgentProxyService.js';
import { AgentLlmProxyService } from '../services/AgentLlmProxyService.js';
import { AgentMemoryService } from '../services/AgentMemoryService.js';
import { TriggerService } from '../services/TriggerService.js';
import { agentStreamBus } from '../services/AgentStreamBus.js';
import { logger } from '../config/logger.js';
import type { AuthService } from '../services/AuthService.js';
import type {
	AgentThreadResponse,
	AgentThreadsListResponse,
	AgentThreadDeleteResponse,
	AgentMessagesListResponse,
	AgentTriggerResponse,
	AgentTriggersListResponse,
	AgentTriggerDeleteResponse,
	RenameThreadRequestBody,
	CreateTriggerRequestBody,
	UpdateTriggerRequestBody,
	ProxyRequest,
	LlmProxyRequest,
	SandboxTokenPayload,
	HitlRequest,
	MemoryWriteRequest,
	MemorySearchRequest,
	ContentBlock,
} from '@repo/types';

/**
 * Normalises a tool result ContentBlock[] into a single displayable string for the browser.
 *
 * Rules:
 *   - Only text blocks are included (image blocks carry base64 data, not useful in a small UI strip).
 *   - Each text value is truncated to TOOL_RESULT_MAX_CHARS and marked "[truncated]" when cut.
 *   - If there is no text output at all, returns a fallback placeholder.
 */
const TOOL_RESULT_MAX_CHARS = 1000;

function formatToolResult(blocks: ContentBlock[]): string {
	const textParts = blocks
		.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
		.map((b) => {
			if (b.text.length > TOOL_RESULT_MAX_CHARS) {
				return b.text.slice(0, TOOL_RESULT_MAX_CHARS) + '… [truncated]';
			}
			return b.text;
		});

	return textParts.length > 0 ? textParts.join('\n') : '(no text output)';
}

/**
 * Runtime router — two sets of routes:
 *
 * 1. User-facing (JWT auth):
 *    POST   /v1/runtime/:agentId/threads                        — create chat thread
 *    GET    /v1/runtime/:agentId/threads                        — list threads
 *    POST   /v1/runtime/:agentId/threads/:threadId/messages     — send user message + spawn container
 *    GET    /v1/runtime/:agentId/threads/:threadId/messages     — get message history
 *    GET    /v1/runtime/:agentId/threads/:threadId/stream       — SSE stream of agent events
 *    POST   /v1/runtime/:agentId/triggers                       — create trigger
 *    GET    /v1/runtime/:agentId/triggers                       — list triggers
 *    PUT    /v1/runtime/:agentId/triggers/:triggerId            — update trigger
 *    DELETE /v1/runtime/:agentId/triggers/:triggerId            — delete trigger
 *    POST   /v1/runtime/:agentId/triggers/:triggerId/fire       — fire manual trigger
 *
 * 2. Sandbox-internal (PROXY_TOKEN auth — called from agent child processes):
 *    GET    /v1/runtime/internal/config                         — fetch agent runtime config
 *    GET    /v1/runtime/internal/thread/:threadId/messages      — load message history
 *    POST   /v1/runtime/internal/thread/:threadId/messages      — append a message (tool_result only)
 *    POST   /v1/runtime/internal/proxy                          — credential proxy
 *    POST   /v1/runtime/internal/llm/stream                     — LLM proxy (streams response)
 *
 * IMPORTANT — ownership enforcement:
 *   All user-facing routes derive ownerId from req.user.sub (the authenticated JWT/API-key
 *   identity set by requireAuth). Client-supplied ownerId values in body/query are never used.
 *   If sub is missing the request is rejected with 401.
 *
 * Thread ↔ Agent cross-check:
 *   Routes that accept both :agentId and :threadId verify that thread.agentId === agentId
 *   to prevent a user from accessing a thread from a different agent via URL manipulation.
 */
export function createRuntimeRouter(
	authService: AuthService,
	sessionService: AgentSessionService,
	runtimeService: AgentRuntimeService,
	proxyService: AgentProxyService,
	llmProxyService: AgentLlmProxyService,
	triggerService: TriggerService,
	memoryService: AgentMemoryService,
): Router {
	const router = Router();
	const auth = requireAuth(authService);

	// ─────────────────────────────────────────────────────────────────────────
	// Sandbox-internal routes — PROXY_TOKEN auth (must be declared before :agentId routes)
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Sandbox-internal auth middleware.
	 * Reads the PROXY_TOKEN from Authorization: Bearer header and verifies it.
	 * Attaches the decoded payload as req.sandboxToken for downstream handlers.
	 * All /internal/* handlers rely on this — they do NOT re-verify the token themselves.
	 */
	router.use('/internal', async (req: Request, res: Response, next) => {
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) {
			res.status(401).json({ success: false, error: 'Missing PROXY_TOKEN' });
			return;
		}
		const token = authHeader.slice(7);
		try {
			const payload = await proxyService.verifyProxyToken(token);
			(req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken = payload;
			next();
		} catch {
			res.status(401).json({ success: false, error: 'Invalid or expired PROXY_TOKEN' });
		}
	});

	/**
	 * GET /v1/runtime/internal/config
	 * Sandbox fetches its runtime config on startup (no secrets included).
	 */
	router.get('/internal/config', (req: Request, res: Response) => {
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;
		res.json({ success: true, data: { agentId: sandboxToken.agentId } });
	});

	/**
	 * GET /v1/runtime/internal/thread/:threadId/messages
	 * Sandbox loads conversation history to restore pi-ai context.
	 */
	router.get('/internal/thread/:threadId/messages', async (req: Request, res: Response) => {
		const { threadId } = req.params as { threadId: string };
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;

		// Enforce that the sandbox can only access its own thread
		if (sandboxToken.threadId !== threadId) {
			res.status(403).json({ success: false, error: 'Thread ID mismatch' });
			return;
		}

		const messages = await sessionService.listMessagesInternal(threadId);
		res.json({ success: true, data: messages });
	});

	/**
	 * POST /v1/runtime/internal/thread/:threadId/messages
	 * Sandbox appends a tool_result message to the thread.
	 * Only 'tool_result' role is accepted — other roles are rejected to prevent
	 * the sandbox from injecting user or assistant messages into history.
	 *
	 * A higher JSON body limit (10 MB) is applied here because tool results can
	 * include large API response bodies (e.g. a Google Sheets export). The global
	 * 1 MB limit in index.ts is intentionally kept tight for all other routes.
	 */
	router.post(
		'/internal/thread/:threadId/messages',
		express.json({ limit: '10mb' }),
		async (req: Request, res: Response) => {
			const { threadId } = req.params as { threadId: string };
			const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;

			if (sandboxToken.threadId !== threadId) {
				res.status(403).json({ success: false, error: 'Thread ID mismatch' });
				return;
			}

			const { role, content, toolCallId, toolName, tokenUsage } = req.body as {
				role: string;
				content: unknown[];
				toolCallId?: string;
				toolName?: string;
				tokenUsage?: unknown;
			};

			// Enforce that sandboxes may only append tool_result messages.
			// Any other role would corrupt conversation history.
			if (role !== 'tool_result') {
				res.status(400).json({
					success: false,
					error: 'Only tool_result messages may be appended by the sandbox',
				});
				return;
			}

			try {
				const message = await sessionService.appendMessage({
					threadId,
					role,
					content: content as Parameters<typeof sessionService.appendMessage>[0]['content'],
					toolCallId,
					toolName,
					tokenUsage: tokenUsage as Parameters<
						typeof sessionService.appendMessage
					>[0]['tokenUsage'],
				});

				// Emit tool_call_end SSE so the browser can display the result inside
				// the ToolCallIndicator that was opened by the earlier tool_call_delta event.
				// The result string is normalised (text only, truncated to 250 chars) before
				// being sent to avoid flooding the SSE stream with large payloads.
				if (toolCallId) {
					const resultText = formatToolResult(
						content as Parameters<typeof sessionService.appendMessage>[0]['content'],
					);
					agentStreamBus.emit(sandboxToken.threadId, {
						type: 'tool_call_end',
						// messageId is not used by the frontend handler for tool_call_end;
						// the result is keyed purely by toolCallId.
						messageId: '',
						toolCallId,
						result: resultText,
					});
				}

				res.status(201).json({ success: true, data: message });
			} catch (err) {
				logger.error({ err, threadId }, '[runtime] failed to append internal message');
				res.status(500).json({ success: false, error: 'Failed to append message' });
			}
		},
	);

	/**
	 * POST /v1/runtime/internal/proxy
	 * Credential proxy — sandbox makes an API call using a resolved credential.
	 * The PROXY_TOKEN is already verified by the /internal middleware; the token
	 * is read from req.sandboxToken — no second verification round-trip.
	 */
	router.post('/internal/proxy', async (req: Request, res: Response) => {
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;
		// Re-read the raw token from the header so executeProxyRequest can do its
		// credential allowlist check (it needs the full token, not just the payload).
		const proxyToken = (req.headers.authorization as string).slice(7);

		try {
			const proxyResponse = await proxyService.executeProxyRequest(
				proxyToken,
				req.body as ProxyRequest,
			);
			res.json({ success: true, data: proxyResponse });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Proxy request failed';
			logger.warn({ err, agentId: sandboxToken.agentId }, '[runtime] proxy request failed');
			res.status(400).json({ success: false, error: message });
		}
	});

	/**
	 * POST /v1/runtime/internal/llm/stream
	 * LLM proxy — sandbox sends a completion request; host resolves the API key,
	 * calls the LLM provider, streams events to AgentStreamBus (→ browser SSE),
	 * and returns the final content for the sandbox's tool loop.
	 * The PROXY_TOKEN is already verified by the /internal middleware.
	 */
	router.post('/internal/llm/stream', async (req: Request, res: Response) => {
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;
		const proxyToken = (req.headers.authorization as string).slice(7);

		try {
			const content = await llmProxyService.executeStream(proxyToken, req.body as LlmProxyRequest);
			res.json({ success: true, data: { content } });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'LLM proxy failed';
			logger.error({ err, agentId: sandboxToken.agentId }, '[runtime] LLM proxy failed');
			res.status(500).json({ success: false, error: message });
		}
	});

	/**
	 * POST /v1/runtime/internal/hitl/request
	 * Human-in-the-Loop — sandbox pauses and waits for a human response.
	 *
	 * This is a long-polling endpoint: it does NOT respond until the human sends
	 * a message via the normal chat message endpoint. The connection is held open
	 * for up to HITL_TIMEOUT_MS (30 min). On timeout it returns 408.
	 *
	 * Flow:
	 *   1. Sandbox POSTs { prompt, options? } here.
	 *   2. proxyService.submitHitlRequest() stores the pending resolver + emits
	 *      a `hitl_request` SSE event so the browser unlocks the chat input.
	 *   3. Route handler awaits the promise.
	 *   4. Human types a reply → POST /:agentId/threads/:threadId/messages detects
	 *      the pending HITL, calls resolveHitlRequest(), and does NOT spawn a child.
	 *   5. Promise resolves here → response { response: string } returned to sandbox.
	 */
	router.post('/internal/hitl/request', async (req: Request, res: Response) => {
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;
		const { prompt, options } = req.body as HitlRequest;

		if (!prompt) {
			res.status(400).json({ success: false, error: 'prompt is required' });
			return;
		}

		logger.info(
			{ agentId: sandboxToken.agentId, threadId: sandboxToken.threadId },
			'[runtime] HITL request received from sandbox',
		);

		try {
			const humanResponse = await proxyService.submitHitlRequest(sandboxToken.threadId, {
				prompt,
				options,
			});
			res.json({ success: true, data: { response: humanResponse } });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'HITL request failed';
			logger.warn(
				{ err, threadId: sandboxToken.threadId },
				'[runtime] HITL request failed or timed out',
			);
			res.status(408).json({ success: false, error: message });
		}
	});

	// ─────────────────────────────────────────────────────────────────────────
	// User-facing routes — JWT auth
	// ownerId is always derived from req.user.sub (set by requireAuth).
	// Client-supplied ownerId values in body/query are never trusted.
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * POST /v1/runtime/:agentId/threads
	 * Create a new chat thread.
	 */
	router.post('/:agentId/threads', auth, async (req: Request, res: Response) => {
		const { agentId } = req.params as { agentId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { title } = req.body as { title?: string };

		try {
			const thread = await sessionService.createThread({ agentId, ownerId, title });
			const body: AgentThreadResponse = { success: true, data: thread };
			res.status(201).json(body);
		} catch (err) {
			logger.error({ err }, '[runtime] failed to create thread');
			res.status(500).json({ success: false, error: 'Failed to create thread' });
		}
	});

	/**
	 * PATCH /v1/runtime/:agentId/threads/:threadId
	 * Rename a thread. Body: { title: string }
	 */
	router.patch('/:agentId/threads/:threadId', auth, async (req: Request, res: Response) => {
		const { agentId, threadId } = req.params as { agentId: string; threadId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const { title } = req.body as RenameThreadRequestBody;
		if (!title || typeof title !== 'string' || !title.trim()) {
			res.status(400).json({ success: false, error: 'title is required' });
			return;
		}

		// Verify ownership and agent-thread relationship
		const thread = await sessionService.getThreadById(threadId, ownerId);
		if (!thread || thread.agentId !== agentId) {
			res.status(404).json({ success: false, error: 'Thread not found' });
			return;
		}

		try {
			await sessionService.updateThreadTitle(threadId, ownerId, title.trim());
			const updated = await sessionService.getThreadById(threadId, ownerId);
			const body: AgentThreadResponse = { success: true, data: updated! };
			res.json(body);
		} catch (err) {
			logger.error({ err, threadId }, '[runtime] failed to rename thread');
			res.status(500).json({ success: false, error: 'Failed to rename thread' });
		}
	});

	/**
	 * DELETE /v1/runtime/:agentId/threads/:threadId
	 * Delete a thread and all its messages.
	 */
	router.delete('/:agentId/threads/:threadId', auth, async (req: Request, res: Response) => {
		const { agentId, threadId } = req.params as { agentId: string; threadId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		// Verify ownership and agent-thread relationship
		const thread = await sessionService.getThreadById(threadId, ownerId);
		if (!thread || thread.agentId !== agentId) {
			const body: AgentThreadDeleteResponse = { success: false, error: 'Thread not found' };
			res.status(404).json(body);
			return;
		}

		const deleted = await sessionService.deleteThread(threadId, ownerId);
		if (!deleted) {
			const body: AgentThreadDeleteResponse = { success: false, error: 'Thread not found' };
			res.status(404).json(body);
			return;
		}
		const body: AgentThreadDeleteResponse = { success: true, data: { deleted: true } };
		res.json(body);
	});

	/**
	 * GET /v1/runtime/:agentId/threads
	 * List all threads for an agent.
	 */
	router.get('/:agentId/threads', auth, async (req: Request, res: Response) => {
		const { agentId } = req.params as { agentId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const threads = await sessionService.listThreads(agentId, ownerId);
		const body: AgentThreadsListResponse = { success: true, data: threads };
		res.json(body);
	});

	/**
	 * POST /v1/runtime/:agentId/threads/:threadId/messages
	 * Send a user message to a thread and spawn a container to process it.
	 */
	router.post('/:agentId/threads/:threadId/messages', auth, async (req: Request, res: Response) => {
		const { agentId, threadId } = req.params as { agentId: string; threadId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { content } = req.body as { content?: string };

		if (!content) {
			res.status(400).json({ success: false, error: 'content is required' });
			return;
		}

		// Verify thread belongs to the authenticated user
		const thread = await sessionService.getThreadById(threadId, ownerId);
		if (!thread) {
			res.status(404).json({ success: false, error: 'Thread not found' });
			return;
		}

		// Verify the thread belongs to the requested agent — prevents cross-agent URL tricks
		if (thread.agentId !== agentId) {
			res.status(404).json({ success: false, error: 'Thread not found' });
			return;
		}

		// If the thread is in a HITL waiting state, resolve the pending request instead
		// of spawning a new child process. The child is still running and awaiting the
		// response to its /internal/hitl/request long-poll.
		if (proxyService.hasPendingHitl(threadId)) {
			logger.info({ threadId }, '[runtime] resolving pending HITL request with user message');
			try {
				const userMessage = await sessionService.appendMessage({
					threadId,
					role: 'user',
					content: [{ type: 'text', text: content }],
				});
				proxyService.resolveHitlRequest(threadId, content);
				res.status(201).json({ success: true, data: userMessage });
			} catch (err) {
				logger.error({ err, threadId }, '[runtime] failed to resolve HITL request');
				res.status(500).json({ success: false, error: 'Failed to send message' });
			}
			return;
		}

		if (thread.status === 'running') {
			res.status(409).json({ success: false, error: 'Agent is currently processing' });
			return;
		}

		try {
			const userMessage = await sessionService.appendMessage({
				threadId,
				role: 'user',
				content: [{ type: 'text', text: content }],
			});

			// After the 2nd user message and the thread has no custom title yet,
			// generate a title non-blocking using the agent's LLM and emit it via SSE.
			const allMessages = await sessionService.listMessages(threadId, ownerId);
			const userMessages = allMessages.filter((m) => m.role === 'user');
			if (userMessages.length === 2) {
				const firstText =
					userMessages[0].content.find((b) => b.type === 'text')?.type === 'text'
						? (
								userMessages[0].content.find((b) => b.type === 'text') as {
									type: 'text';
									text: string;
								}
							).text
						: '';
				const secondText = content;

				// Fire-and-forget: title generation should not block the response
				llmProxyService
					.generateThreadTitle(threadId, ownerId, agentId, firstText, secondText)
					.then((title) => {
						if (title) {
							agentStreamBus.emit(threadId, {
								type: 'thread_title_updated',
								threadId,
								title,
							});
						}
					})
					.catch((err: Error) => {
						logger.warn({ err, threadId }, '[runtime] thread title generation error (non-fatal)');
					});
			}

			// Spawn container (non-blocking)
			await runtimeService.spawnForThread(agentId, threadId, ownerId, 'chat');

			res.status(201).json({ success: true, data: userMessage });
		} catch (err) {
			logger.error({ err, agentId, threadId }, '[runtime] failed to send message');
			res.status(500).json({ success: false, error: 'Failed to send message' });
		}
	});

	/**
	 * GET /v1/runtime/:agentId/threads/:threadId/messages
	 * Get the full message history for a thread.
	 */
	router.get('/:agentId/threads/:threadId/messages', auth, async (req: Request, res: Response) => {
		const { agentId, threadId } = req.params as { agentId: string; threadId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		// Verify thread ownership and that it belongs to the requested agent
		const thread = await sessionService.getThreadById(threadId, ownerId);
		if (!thread || thread.agentId !== agentId) {
			res.status(404).json({ success: false, error: 'Thread not found' });
			return;
		}

		const messages = await sessionService.listMessages(threadId, ownerId);
		const body: AgentMessagesListResponse = { success: true, data: messages };
		res.json(body);
	});

	/**
	 * GET /v1/runtime/:agentId/threads/:threadId/stream
	 * SSE endpoint — browser subscribes here to receive real-time agent events.
	 *
	 * Connection lifecycle:
	 *   1. Browser connects → SSE headers set, subscribe to AgentStreamBus for this thread
	 *   2. Agent events emitted via AgentStreamBus → written as SSE data frames
	 *   3. On browser disconnect → unsubscribe and clear heartbeat
	 */
	router.get('/:agentId/threads/:threadId/stream', auth, async (req: Request, res: Response) => {
		const { agentId, threadId } = req.params as { agentId: string; threadId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		// Verify ownership and agent match before opening the SSE connection
		const thread = await sessionService.getThreadById(threadId, ownerId);
		if (!thread || thread.agentId !== agentId) {
			res.status(404).json({ success: false, error: 'Thread not found' });
			return;
		}

		// SSE headers
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
		res.flushHeaders();

		// Heartbeat every 15s to keep the connection alive through proxies
		const heartbeat = setInterval(() => {
			res.write(': heartbeat\n\n');
		}, 15_000);

		const unsubscribe = agentStreamBus.subscribe(threadId, (event) => {
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		});

		req.on('close', () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});

	// ─── Trigger Routes ───────────────────────────────────────────────────────

	/**
	 * POST /v1/runtime/:agentId/triggers
	 * Create a new trigger for an agent.
	 */
	router.post('/:agentId/triggers', auth, async (req: Request, res: Response) => {
		const { agentId } = req.params as { agentId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}
		const { kind, name, config, description } = req.body as CreateTriggerRequestBody;

		if (!kind || !name || !config) {
			const body: AgentTriggerResponse = {
				success: false,
				error: 'kind, name and config are required',
			};
			res.status(400).json(body);
			return;
		}

		try {
			const trigger = await triggerService.create({
				agentId,
				ownerId,
				kind,
				name,
				config,
				description,
			});
			const body: AgentTriggerResponse = { success: true, data: trigger };
			res.status(201).json(body);
		} catch (err) {
			logger.error({ err }, '[runtime] failed to create trigger');
			res.status(500).json({ success: false, error: 'Failed to create trigger' });
		}
	});

	/**
	 * GET /v1/runtime/:agentId/triggers
	 * List all triggers for an agent.
	 */
	router.get('/:agentId/triggers', auth, async (req: Request, res: Response) => {
		const { agentId } = req.params as { agentId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const triggers = await triggerService.listByAgent(agentId, ownerId);
		const body: AgentTriggersListResponse = { success: true, data: triggers };
		res.json(body);
	});

	/**
	 * PUT /v1/runtime/:agentId/triggers/:triggerId
	 * Update a trigger.
	 */
	router.put('/:agentId/triggers/:triggerId', auth, async (req: Request, res: Response) => {
		const { triggerId } = req.params as { triggerId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		try {
			const trigger = await triggerService.update(
				triggerId,
				ownerId,
				req.body as UpdateTriggerRequestBody,
			);
			if (!trigger) {
				res.status(404).json({ success: false, error: 'Trigger not found' });
				return;
			}
			const body: AgentTriggerResponse = { success: true, data: trigger };
			res.json(body);
		} catch (err) {
			logger.error({ err }, '[runtime] failed to update trigger');
			res.status(500).json({ success: false, error: 'Failed to update trigger' });
		}
	});

	/**
	 * DELETE /v1/runtime/:agentId/triggers/:triggerId
	 * Delete a trigger.
	 */
	router.delete('/:agentId/triggers/:triggerId', auth, async (req: Request, res: Response) => {
		const { triggerId } = req.params as { triggerId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const deleted = await triggerService.delete(triggerId, ownerId);
		if (!deleted) {
			const body: AgentTriggerDeleteResponse = { success: false, error: 'Trigger not found' };
			res.status(404).json(body);
			return;
		}
		const body: AgentTriggerDeleteResponse = { success: true, data: { deleted: true } };
		res.json(body);
	});

	/**
	 * POST /v1/runtime/:agentId/triggers/:triggerId/fire
	 * Manually fire a trigger (only valid for kind='manual').
	 */
	router.post('/:agentId/triggers/:triggerId/fire', auth, async (req: Request, res: Response) => {
		const { triggerId } = req.params as { triggerId: string };
		const ownerId = req.user?.sub;
		if (!ownerId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		try {
			await triggerService.fireManualTrigger(triggerId, ownerId);
			res.json({ success: true, data: { fired: true } });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to fire trigger';
			logger.warn({ err, triggerId }, '[runtime] failed to fire manual trigger');
			res.status(400).json({ success: false, error: message });
		}
	});

	// ─── Memory internal endpoints (PROXY_TOKEN auth) ─────────────────────────

	/**
	 * POST /v1/runtime/internal/memory/write
	 * Sandbox writes a memory entry for the current agent.
	 * The host embeds the content and persists it to the DB.
	 * agentId is taken from the PROXY_TOKEN — the sandbox cannot write to another agent's memory.
	 */
	router.post('/internal/memory/write', async (req: Request, res: Response) => {
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;
		const body = req.body as MemoryWriteRequest;

		if (!body.content || !body.memoryType) {
			res.status(400).json({ success: false, error: 'content and memoryType are required' });
			return;
		}

		try {
			const entry = await memoryService.writeMemory(
				sandboxToken.agentId,
				sandboxToken.ownerId,
				body,
			);
			res.status(201).json({ success: true, data: entry });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Memory write failed';
			logger.error({ err, agentId: sandboxToken.agentId }, '[runtime] memory write failed');
			res.status(400).json({ success: false, error: message });
		}
	});

	/**
	 * POST /v1/runtime/internal/memory/search
	 * Sandbox searches the current agent's memory by semantic similarity.
	 * The host embeds the query and returns the nearest entries (cosine distance).
	 * agentId is taken from the PROXY_TOKEN — cannot search another agent's memory.
	 */
	router.post('/internal/memory/search', async (req: Request, res: Response) => {
		const sandboxToken = (req as Request & { sandboxToken: SandboxTokenPayload }).sandboxToken;
		const body = req.body as MemorySearchRequest;

		if (!body.query) {
			res.status(400).json({ success: false, error: 'query is required' });
			return;
		}

		try {
			const results = await memoryService.searchMemory(
				sandboxToken.agentId,
				sandboxToken.ownerId,
				body,
			);
			res.json({ success: true, data: results });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Memory search failed';
			logger.error({ err, agentId: sandboxToken.agentId }, '[runtime] memory search failed');
			res.status(400).json({ success: false, error: message });
		}
	});

	return router;
}
