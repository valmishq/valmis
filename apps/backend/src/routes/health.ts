import { Router } from 'express';
import type { Request, Response } from 'express';

export const healthRouter = Router();

// GET /health — basic health check endpoint
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
