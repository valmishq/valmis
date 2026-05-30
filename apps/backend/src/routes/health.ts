import { Router } from 'express';
import type { Request, Response } from 'express';
import type { HealthResponse } from '@repo/types';
export const healthRouter = Router();

// GET /health — basic health check endpoint
healthRouter.get('/', (_req: Request, res: Response) => {
	const response: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() };
	res.json(response);
});
