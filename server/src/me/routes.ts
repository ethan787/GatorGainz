import { Router } from 'express';
import type {
  AuthUser,
  PointsResponse,
  ScoredWorkoutResponse,
  WorkoutHistoryResponse,
} from '@gatorgainz/types';
import type { AuthStore } from '../auth/store';
import { createRequestVerifier, requireJson } from '../auth/routes';
import { createRequireUser } from '../auth/require-user';
import { buildUpdate } from '../scoring/service';
import type { FitnessStore } from '../types';
import { encodeCursor, parseHistoryQuery } from './history-query';

export interface MeRouteOptions {
  authStore?: AuthStore;
  authOrigin?: string;
}

/**
 * Private, session-owned routes under /api/me. None of them accept a user ID: the owner is
 * always the signed-in account. Separate from the public preview routes (/api/workouts, etc.).
 */
export function createMeRouter(store: FitnessStore, options: MeRouteOptions = {}) {
  const router = Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createRequestVerifier(options.authOrigin));

  if (!options.authStore) {
    // Without PostgreSQL there are no accounts. Never answer with demo history.
    router.use((_request, response) => {
      response
        .status(503)
        .json({ error: 'Account data is unavailable. Configure PostgreSQL first.' });
    });
    return router;
  }
  router.use(createRequireUser(options.authStore));
  const owner = (locals: Record<string, unknown>) => (locals.user as AuthUser).id;

  router.get('/workouts', async (request, response) => {
    const parsed = parseHistoryQuery(request.query as Record<string, unknown>);
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const { query } = parsed;
    const page = await store.getWorkoutHistory(owner(response.locals), query);
    const last = page.items.at(-1);
    response.json({
      items: page.items,
      pagination: {
        limit: query.limit,
        hasMore: page.hasMore,
        nextCursor: page.hasMore && last ? encodeCursor(last, query) : null,
      },
    } satisfies WorkoutHistoryResponse);
  });

  router.put('/workouts/:id', requireJson, async (request, response) => {
    const parsed = buildUpdate(request.body);
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const saved = await store.updateUserWorkout(
      owner(response.locals),
      String(request.params.id),
      parsed.fields,
      parsed.exercises,
      parsed.rescore,
    );
    if (!saved) {
      // Same answer for "missing" and "someone else's", so IDs cannot be probed.
      response.status(404).json({ error: 'Workout not found.' });
      return;
    }
    response.json(saved satisfies ScoredWorkoutResponse);
  });

  router.delete('/workouts/:id', async (request, response) => {
    const deleted = await store.deleteUserWorkout(
      owner(response.locals),
      String(request.params.id),
    );
    if (!deleted) {
      response.status(404).json({ error: 'Workout not found.' });
      return;
    }
    response.status(204).end();
  });

  router.get('/points', async (_request, response) => {
    response.json((await store.getUserPoints(owner(response.locals))) satisfies PointsResponse);
  });

  return router;
}
