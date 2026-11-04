import { Router, type RequestHandler } from 'express';
import type { AuthUser, NewWorkoutRequest, Workout, WorkoutResponse } from '@gatorgainz/types';
import type { AuthStore } from '../auth/store';
import { createRequestVerifier, presentedTokenHash, requireJson } from '../auth/routes';
import type { FitnessStore } from '../types';

export const WORKOUT_CATEGORIES: readonly Workout['category'][] = [
  'strength',
  'cardio',
  'mobility',
];
export const MAX_WORKOUT_MINUTES = 24 * 60;
const MAX_NAME_LENGTH = 120;

type WorkoutValidation = { workout: NewWorkoutRequest } | { error: string };

/** Today's date (YYYY-MM-DD) in UTC, plus one day so users ahead of UTC can log "today". */
function latestAllowedDate(now: Date): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validates a workout body. The owner is never read from the body. */
export function validateNewWorkout(body: unknown, now = new Date()): WorkoutValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Send the workout as a JSON object.' };
  }
  const input = body as Record<string, unknown>;

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || Array.from(name).length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    return { error: `Enter a workout name of 1–${MAX_NAME_LENGTH} characters.` };
  }

  const category = input.category;
  if (
    typeof category !== 'string' ||
    !WORKOUT_CATEGORIES.includes(category as Workout['category'])
  ) {
    return { error: `Category must be one of: ${WORKOUT_CATEGORIES.join(', ')}.` };
  }

  const durationMinutes = input.durationMinutes;
  if (
    typeof durationMinutes !== 'number' ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > MAX_WORKOUT_MINUTES
  ) {
    return {
      error: `Duration must be a whole number of minutes from 1 to ${MAX_WORKOUT_MINUTES}.`,
    };
  }

  const completedAt = input.completedAt;
  if (typeof completedAt !== 'string' || !isRealDate(completedAt)) {
    return { error: 'Completed date must be a real date in YYYY-MM-DD format.' };
  }
  if (completedAt > latestAllowedDate(now)) {
    return { error: 'Completed date cannot be in the future.' };
  }

  return {
    workout: { name, category: category as Workout['category'], durationMinutes, completedAt },
  };
}

export interface WorkoutRouteOptions {
  authStore?: AuthStore;
  authOrigin?: string;
}

/** Authenticated workout routes: POST /api/workouts and GET /api/workouts/mine. */
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

  const requireUser: RequestHandler = async (request, response, next) => {
    const tokenHash = presentedTokenHash(request);
    const user = tokenHash ? await authStore.findSessionUser(tokenHash) : null;
    if (!user) {
      response.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }
    response.locals.user = user;
    next();
  };

  router.get('/mine', requireUser, async (_request, response) => {
    const user = response.locals.user as AuthUser;
    response.json(await store.getUserWorkouts(user.id));
  });

  router.post('/', requireJson, requireUser, async (request, response) => {
    const user = response.locals.user as AuthUser;
    const result = validateNewWorkout(request.body);
    if ('error' in result) {
      response.status(400).json({ error: result.error });
      return;
    }
    const workout = await store.createWorkout(user.id, result.workout);
    response.status(201).json({ workout } satisfies WorkoutResponse);
  });

  return router;
}
