import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { referenceRouter } from './modules/reference/reference.router.js';
import { promptSetsRouter } from './modules/promptsets/promptsets.router.js';
import { runsRouter } from './modules/runs/runs.router.js';

/**
 * Builds the Express application. Feature routers are mounted here (promptsets,
 * runs). Kept separate from index.ts so tests can import the app without
 * starting a listener.
 */
export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Authenticated identity probe — used to verify auth wiring end to end.
  app.get('/api/me', requireAuth(), (req, res) => {
    res.json({ userId: req.userId });
  });

  // Feature routers.
  app.use('/api', referenceRouter());
  app.use('/api', promptSetsRouter());
  app.use('/api', runsRouter());

  // Terminal error handler — must be registered last.
  app.use(errorHandler);

  return app;
}
