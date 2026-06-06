import type { Request, Response, NextFunction } from 'express';
import { agentStreamBus } from '../services/AgentStreamBus.js';
import { logger } from '../config/logger.js';

/**
 * Global Express error-handler middleware.
 *
 * Must be registered AFTER all routes (last `app.use` call). Express recognises it
 * as an error handler because it has exactly 4 parameters (err, req, res, next).
 *
 * Responsibilities:
 *   1. Log the error with full context.
 *   2. For sandbox-internal runtime routes, emit an SSE `error` + `done` event so
 *      the browser can display the error message and unlock the chat input.
 *      This covers middleware errors (e.g. `PayloadTooLargeError` from body-parser)
 *      that fire before any route handler runs — without this, the UI freezes.
 *   3. Return a standardised JSON error response to the caller.
 */
export function errorHandler(
	err: Error & { status?: number; statusCode?: number; type?: string },
	req: Request,
	res: Response,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_next: NextFunction,
): void {
	logger.error({ err, path: req.path, method: req.method }, '[backend] unhandled middleware error');

	// For internal sandbox routes, emit an SSE error to the browser so the user
	// sees what failed rather than having the UI freeze indefinitely.
	// Extract threadId from paths like /v1/runtime/internal/thread/:threadId/...
	const internalThreadMatch = req.path.match(/\/internal\/thread\/([^/]+)\//);
	if (internalThreadMatch) {
		const threadId = internalThreadMatch[1];
		agentStreamBus.emit(threadId, {
			type: 'error',
			message: err.message ?? 'An internal error occurred while processing the agent response.',
		});
		agentStreamBus.emit(threadId, { type: 'done' });
	}

	const status = err.status ?? err.statusCode ?? 500;
	res.status(status).json({ success: false, error: err.message ?? 'Internal server error' });
}
