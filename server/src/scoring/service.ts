import { createHash } from 'node:crypto';
import type { ScoringVersion } from '@gatorgainz/types';
import type { Rescore, WorkoutFields, WorkoutSubmission } from '../types';
import { validateNewWorkout } from '../workouts/validation';
import { CURRENT_SCORING_VERSION } from './config';
import {
  calculateWorkoutPoints,
  normalizeExercises,
  WorkoutScoringError,
  type ScoredExercise,
} from './score';

const SUBMISSION_KEY = /^[A-Za-z0-9_-]{8,128}$/;

type Result<T> = T | { error: string };

function fingerprint(fields: WorkoutFields, exercises: ScoredExercise[]): string {
  // Only normalized, trusted values: the same logical workout always has the same digest.
  return createHash('sha256').update(JSON.stringify({ fields, exercises })).digest('hex');
}

function parseExercises(body: Record<string, unknown>): Result<{ exercises: ScoredExercise[] }> {
  if (body.exercises === undefined) return { exercises: [] };
  try {
    return { exercises: normalizeExercises(body.exercises) };
  } catch (error) {
    if (error instanceof WorkoutScoringError) return { error: error.message };
    throw error;
  }
}

/**
 * Validates a POST /api/workouts body and scores it. Any client point total is ignored:
 * points come only from catalog values and the explicit scoring version.
 */
export function buildSubmission(
  body: unknown,
  scoringVersion: ScoringVersion = CURRENT_SCORING_VERSION,
  now = new Date(),
): Result<{ submission: WorkoutSubmission }> {
  const validated = validateNewWorkout(body, now);
  if ('error' in validated) return validated;
  const input = body as Record<string, unknown>;

  const parsed = parseExercises(input);
  if ('error' in parsed) return parsed;

  const key = input.submissionKey;
  if (key !== undefined && (typeof key !== 'string' || !SUBMISSION_KEY.test(key))) {
    return { error: 'submissionKey must be 8–128 letters, digits, underscores, or hyphens.' };
  }
  if (parsed.exercises.length > 0 && key === undefined) {
    return { error: 'Send a submissionKey with exercises so retries cannot double-award points.' };
  }

  const fields: WorkoutFields = validated.workout;
  return {
    submission: {
      fields,
      submissionKey: key as string | undefined,
      fingerprint: key === undefined ? undefined : fingerprint(fields, parsed.exercises),
      exercises: parsed.exercises,
      award:
        parsed.exercises.length > 0
          ? calculateWorkoutPoints(parsed.exercises, scoringVersion)
          : null,
    },
  };
}

/**
 * Validates a PUT /api/me/workouts/:id body. Edit policy: the workout is re-scored under the
 * version already recorded on its award, so edits never silently move it to a newer formula.
 * A workout without an award uses the current version. Removing all exercises removes the award.
 */
export function buildUpdate(
  body: unknown,
  now = new Date(),
): Result<{ fields: WorkoutFields; exercises: ScoredExercise[]; rescore: Rescore }> {
  const validated = validateNewWorkout(body, now);
  if ('error' in validated) return validated;
  if ('submissionKey' in (body as object)) {
    return { error: 'submissionKey cannot be changed on an existing workout.' };
  }
  const parsed = parseExercises(body as Record<string, unknown>);
  if ('error' in parsed) return parsed;
  const { exercises } = parsed;
  return {
    fields: validated.workout,
    exercises,
    rescore: (previousVersion) =>
      exercises.length > 0
        ? calculateWorkoutPoints(exercises, previousVersion ?? CURRENT_SCORING_VERSION)
        : null,
  };
}
