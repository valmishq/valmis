import { rateLimit } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../services/AuthService.js';
import { ApiKeyService } from '../services/ApiKeyService.js';
import { UserService } from '../services/UserService.js';
import { AuthorizationService } from '../services/AuthorizationService.js';
import type { AuthTokenPayload, AppActions, AppSubjects } from '@repo/types';

// Extend Express Request to carry the authenticated user payload
declare global {
	namespace Express {
		interface Request {
			user?: AuthTokenPayload;
		}
	}
}

const userService = new UserService();
const authorizationService = new AuthorizationService();

/** Parse a positive-integer env var, falling back to a default when unset/invalid. */
function envInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Rate limiter middleware — keyed by real client IP.
 * Requires app.set('trust proxy', true) so X-Forwarded-For is trusted.
 *
 * Window and per-window cap are configurable via env (per IP):
 *   RATE_LIMIT_WINDOW_MS — window length in ms (default 60000 = 1 minute)
 *   RATE_LIMIT_MAX       — max requests per window (default 2000)
 */
export const rateLimiter = rateLimit({
	windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60_000),
	max: envInt('RATE_LIMIT_MAX', 500),
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, error: 'Too many requests, please try again later.' },
});

/**
 * requireAuth — Express middleware factory.
 * Checks in order:
 *   1. X-Api-Key header → validate via ApiKeyService, load user from DB.
 *   2. Authorization: Bearer <token> → verify JWT via AuthService.
 * Sets req.user on success; responds 401 otherwise.
 */
export function requireAuth(authService: AuthService) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		// --- API key path ---
		const apiKey = req.headers['x-api-key'];
		if (apiKey && typeof apiKey === 'string') {
			const userId = await ApiKeyService.validateKey(apiKey);
			if (!userId) {
				res.status(401).json({ success: false, error: 'Invalid or expired API key' });
				return;
			}

			const user = await userService.findById(userId);
			if (!user) {
				res.status(401).json({ success: false, error: 'User not found' });
				return;
			}

			req.user = {
				sub: user.id,
				email: user.email,
				roles: user.role ? [user.role.name] : [],
			};
			next();
			return;
		}

		// --- JWT path (Authorization header) ---
		const authHeader = req.headers.authorization;
		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.slice(7);
			const payload = await authService.verifyToken(token);
			if (!payload) {
				res.status(401).json({ success: false, error: 'Invalid or expired token' });
				return;
			}
			req.user = payload;
			next();
			return;
		}

		// --- JWT path (query param) — for EventSource which cannot send custom headers ---
		// Only accepted on GET requests to limit the exposure surface.
		const queryToken = req.method === 'GET' ? (req.query.token as string | undefined) : undefined;
		if (queryToken) {
			const payload = await authService.verifyToken(queryToken);
			if (!payload) {
				res.status(401).json({ success: false, error: 'Invalid or expired token' });
				return;
			}
			req.user = payload;
			next();
			return;
		}

		res.status(401).json({ success: false, error: 'No token provided' });
	};
}

/**
 * requirePermission — Express middleware factory.
 * Reads req.user.sub and checks CASL ability via AuthorizationService.
 * Responds 401 if no user is set, 403 if the action is not allowed.
 */
export function requirePermission(action: AppActions, subject: AppSubjects) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const userId = req.user?.sub;
		if (!userId) {
			res.status(401).json({ success: false, error: 'Unauthorized' });
			return;
		}

		const allowed = await authorizationService.can(userId, action, subject);
		if (!allowed) {
			res.status(403).json({ success: false, error: 'Forbidden' });
			return;
		}

		next();
	};
}
