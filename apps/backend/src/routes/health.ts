import { Router } from 'express';
import type { Request, Response } from 'express';
import type { HealthResponse, HealthApiResponse } from '@repo/types';

export const healthRouter = Router();

// GET /health — basic health check endpoint
healthRouter.get('/', (_req: Request, res: Response) => {
	const data: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() };
	const body: HealthApiResponse = { success: true, data };
	res.json(body);
});
