import express, { type ErrorRequestHandler } from 'express';
import type { FitnessStore } from './types';
import { createAuthRouter, type AuthOptions } from './auth/routes';

export function createApp(store: FitnessStore, options: AuthOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/auth', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/auth', createAuthRouter(options));

  app.get('/api/health', async (_request, response) => {
    await store.checkConnection();
    response.json({ status: 'ok', dataSource: store.dataSource });
  });
  app.get('/api/users', async (_request, response) => response.json(await store.getUsers()));
  app.get('/api/workouts', async (_request, response) => response.json(await store.getWorkouts()));
  app.get('/api/goals', async (_request, response) => response.json(await store.getGoals()));
  app.get('/api/rankings', async (_request, response) => response.json(await store.getRankings()));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Route not found.' });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      response.status(400).json({ error: 'Invalid JSON request body.' });
      return;
    }
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 413) {
      response.status(413).json({ error: 'Request body is too large.' });
      return;
    }
    console.error('API request failed:', error);
    response.status(500).json({ error: 'Unable to complete the request.' });
  };
  app.use(handleError);
  return app;
}
