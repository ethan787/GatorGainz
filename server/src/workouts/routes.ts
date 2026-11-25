import { Router } from 'express';
import type { AuthUser, ScoredWorkoutResponse } from '@gatorgainz/types';
import type { AuthStore } from '../auth/store';
import { createRequestVerifier, requireJson } from '../auth/routes';
import { createRequireUser } from '../auth/require-user';
import { buildSubmission } from '../scoring/service';
import { SubmissionKeyConflictError, type FitnessStore } from '../types';

export { MAX_WORKOUT_MINUTES, validateNewWorkout, WORKOUT_CATEGORIES } from './validation';

export interface WorkoutRouteOptions {
  authStore?: AuthStore;
  authOrigin?: string;
}

/**
 * Authenticated workout routes: POST /api/workouts (scored, retry-safe) and GET /api/workouts/mine.
 * The paginated private history lives at GET /api/me/workouts.
 */
export function createWorkoutRouter(store: FitnessStore, options: WorkoutRouteOptions = {}) {
  const router = Router();
  const authStore = options.authStore;

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createRequestVerifier(options.authOrigin));

  // Accounts live in PostgreSQL, so saving workouts needs it too.
  if (!authStore) {
    router.use((_request, response) => {
      response
        .status(503)
        .json({ error: 'Workout saving is unavailable. Configure PostgreSQL first.' });
    });
    return router;
  }

  const requireUser = createRequireUser(authStore);

  router.get('/mine', requireUser, async (_request, response) => {
    const user = response.locals.user as AuthUser;
    response.json(await store.getUserWorkouts(user.id));
  });

  router.post('/', requireJson, requireUser, async (request, response) => {
    const user = response.locals.user as AuthUser;
    const result = buildSubmission(request.body);
    if ('error' in result) {
      response.status(400).json({ error: result.error });
      return;
    }
    try {
      const saved = await store.submitWorkout(user.id, result.submission);
      // 201 for a new workout; 200 when a retry returned the original workout and award.
      response.status(saved.created ? 201 : 200).json(saved satisfies ScoredWorkoutResponse);
    } catch (error) {
      if (error instanceof SubmissionKeyConflictError) {
        response.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  return router;
}
