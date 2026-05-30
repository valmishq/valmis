import type { Request, Response, NextFunction } from 'express';

const ALLOWED_ORIGINS = (
	process.env.ALLOWED_ORIGINS ?? `http://localhost:${process.env.FRONTEND_PORT ?? 3000}`
).split(',');

/**
 * Simple CORS middleware allowing requests from the frontend origin.
 * In production, set ALLOWED_ORIGINS env var to your deployed frontend URL.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
	const origin = req.headers.origin;

	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
		// Required for browser cookie support (e.g. accessToken cookie)
		res.setHeader('Access-Control-Allow-Credentials', 'true');
	}

	if (req.method === 'OPTIONS') {
		res.sendStatus(204);
		return;
	}

	next();
}
