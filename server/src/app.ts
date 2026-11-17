import express, { type ErrorRequestHandler } from 'express';
import type { FitnessStore } from './types';
import { createAuthRouter, type AuthOptions } from './auth/routes';
import { createWorkoutRouter } from './workouts/routes';
import { createMeRouter } from './me/routes';
import { createCommunityRouter, createInviteRouter } from './community/routes';
import type { CommunityStore } from './community/store';

export interface AppOptions extends AuthOptions {
  /** Profiles, connections, and leaderboards. PostgreSQL only; absent in demo mode. */
  communityStore?: CommunityStore;
  invitePreviewMax?: number;
}

export function createApp(store: FitnessStore, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/auth', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(
    '/api/auth',
    createAuthRouter({
      ...options,
      onRegistered: options.onRegistered ?? options.communityStore?.ensureProfile,
    }),
  );

  app.get('/api/health', async (_request, response) => {
    await store.checkConnection();
    response.json({ status: 'ok', dataSource: store.dataSource });
  });
  app.get('/api/users', async (_request, response) => response.json(await store.getUsers()));
  app.get('/api/workouts', async (_request, response) => response.json(await store.getWorkouts()));
  // Mounted after the public list so GET /api/workouts keeps working without a database.
  app.use(
    '/api/workouts',
    createWorkoutRouter(store, { authStore: options.authStore, authOrigin: options.authOrigin }),
  );
  // Private account data. Kept apart from the public preview endpoints above and below.
  app.use(
    '/api/me',
    createMeRouter(store, {
      authStore: options.authStore,
      authOrigin: options.authOrigin,
      community: options.communityStore,
    }),
  );
  const communityOptions = {
    community: options.communityStore,
    authStore: options.authStore,
    authOrigin: options.authOrigin,
    invitePreviewMax: options.invitePreviewMax,
  };
  app.use('/api/community', createCommunityRouter(communityOptions));
  app.use('/api/invites', createInviteRouter(communityOptions));
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
