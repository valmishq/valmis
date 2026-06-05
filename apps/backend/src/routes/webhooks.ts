import { Router } from 'express';
import type { Request, Response } from 'express';
import { TriggerService } from '../services/TriggerService.js';
import { logger } from '../config/logger.js';

/**
 * Webhook router — public endpoints for external services to trigger agents.
 *
 * Routes:
 *   POST /v1/webhooks/:triggerId  — receive a webhook and fire the corresponding agent trigger
 *
 * Security:
 *   - No user auth — these endpoints are called by external services
 *   - HMAC-SHA256 signature verified against the trigger's stored secret
 *   - Signature must be in the X-Hub-Signature-256 header: "sha256=<hex>"
 *   - Mismatched signatures return 401 without revealing whether the trigger exists
 *
 * Note: express.json() must NOT parse the body before this router because
 * HMAC verification requires the raw body bytes. This router uses express.raw()
 * to buffer the body, then parses it manually.
 */
export function createWebhooksRouter(triggerService: TriggerService): Router {
	const router = Router();

	/**
	 * POST /v1/webhooks/:triggerId
	 * External webhook — receives a payload and fires the agent trigger.
	 *
	 * Expected headers:
	 *   Content-Type: application/json
	 *   X-Hub-Signature-256: sha256=<hmac-hex>
	 */
	router.post(
		'/:triggerId',
		// Buffer raw body for HMAC verification before JSON parsing
		(req: Request, _res: Response, next) => {
			let rawBody = Buffer.alloc(0);
			req.on('data', (chunk: Buffer) => {
				rawBody = Buffer.concat([rawBody, chunk]);
			});
			req.on('end', () => {
				(req as Request & { rawBody: Buffer }).rawBody = rawBody;
				next();
			});
		},
		async (req: Request, res: Response) => {
			const { triggerId } = req.params as { triggerId: string };
			const signature = req.headers['x-hub-signature-256'] as string | undefined;
			const rawBody = (req as Request & { rawBody: Buffer }).rawBody;

			if (!signature) {
				res.status(401).json({ success: false, error: 'Missing X-Hub-Signature-256 header' });
				return;
			}

			let payload: Record<string, unknown>;
			try {
				payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;
			} catch {
				res.status(400).json({ success: false, error: 'Invalid JSON body' });
				return;
			}

			try {
				await triggerService.fireWebhookTrigger(triggerId, signature, rawBody, payload);
				res.json({ success: true, data: { received: true } });
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Webhook processing failed';

				// Return 401 for all auth/validation errors to avoid leaking info
				if (
					message.includes('signature') ||
					message.includes('not found') ||
					message.includes('disabled') ||
					message.includes('not a webhook')
				) {
					logger.warn({ triggerId, message }, '[webhooks] webhook rejected');
					res.status(401).json({ success: false, error: 'Unauthorized' });
					return;
				}

				logger.error({ err, triggerId }, '[webhooks] webhook processing error');
				res.status(500).json({ success: false, error: 'Internal error' });
			}
		},
	);

	return router;
}
