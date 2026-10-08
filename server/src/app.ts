import express, { type ErrorRequestHandler } from 'express';
import type { FitnessStore } from './types';

export function createApp(store: FitnessStore) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

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
    console.error('API request failed:', error);
    response.status(500).json({ error: 'Unable to complete the request.' });
  };
  app.use(handleError);
  return app;
}
