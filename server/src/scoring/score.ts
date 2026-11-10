import type {
  ExerciseAward,
  ExerciseDefinition,
  ScoringVersion,
  WorkoutExerciseInput,
} from '@gatorgainz/types';
import { EXERCISE_CATALOG, SCORING_VERSIONS } from './config';

/** An exercise after validation against the trusted catalog. This is what gets persisted. */
export interface ScoredExercise {
  name: string;
  group: string;
  difficulty: ExerciseDefinition['difficulty'];
  basePoints: number;
  tracking: 'strength' | 'cardio';
  sets: number;
  reps: number;
  minutes: number;
  metricValue: number;
  metricBaseline: number;
}

export interface ScoringResult {
  points: number;
  scoringVersion: ScoringVersion;
  exercises: ExerciseAward[];
}

export class WorkoutScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutScoringError';
  }
}

export const MAX_EXERCISES = 50;
const catalogByName = new Map(EXERCISE_CATALOG.map((exercise) => [exercise.name, exercise]));

export function isScoringVersion(value: unknown): value is ScoringVersion {
  return typeof value === 'string' && (SCORING_VERSIONS as readonly string[]).includes(value);
}

function wholeNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new WorkoutScoringError(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function metric(value: unknown, definition: ExerciseDefinition): number {
  const config = definition.cardioMetric!;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < config.min ||
    value > config.max
  ) {
    throw new WorkoutScoringError(
      `${definition.name}: ${config.label} must be from ${config.min} to ${config.max}.`,
    );
  }
  return value;
}

/** Validates client exercises against the catalog. Unknown or out-of-range input is rejected. */
export function normalizeExercises(input: unknown): ScoredExercise[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_EXERCISES) {
    throw new WorkoutScoringError(`Send between 1 and ${MAX_EXERCISES} exercises.`);
  }
  return input.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new WorkoutScoringError('Each exercise must be a JSON object.');
    }
    const exercise = item as WorkoutExerciseInput;
    const definition =
      typeof exercise.name === 'string' ? catalogByName.get(exercise.name) : undefined;
    if (!definition) throw new WorkoutScoringError('Each exercise must name a catalog exercise.');

    const base = {
      name: definition.name,
      group: definition.group,
      difficulty: definition.difficulty,
      basePoints: definition.points,
    };
    if (definition.tracking === 'cardio' && definition.cardioMetric) {
      return {
        ...base,
        tracking: 'cardio' as const,
        sets: 0,
        reps: 0,
        minutes: wholeNumber(exercise.minutes, `${definition.name}: Minutes`, 1, 600),
        metricValue: metric(exercise.metricValue, definition),
        metricBaseline: definition.cardioMetric.baseline,
      };
    }
    return {
      ...base,
      tracking: 'strength' as const,
      sets: wholeNumber(exercise.sets, `${definition.name}: Sets`, 1, 20),
      reps: wholeNumber(exercise.reps, `${definition.name}: Reps`, 1, 100),
      minutes: 0,
      metricValue: 0,
      metricBaseline: 0,
    };
  });
}

/**
 * Pure scoring function. Same exercises and version always give the same result.
 * v1: strength = round(base × sets × reps / 8);
 *     cardio = round(base × minutes / 20 × (0.75 + 0.25 × metric / baseline));
 *     workout = sum of the rounded exercise awards.
 */
export function calculateWorkoutPoints(
  exercises: readonly ScoredExercise[],
  scoringVersion: ScoringVersion,
): ScoringResult {
  if (scoringVersion !== 'v1') throw new WorkoutScoringError('Unsupported scoring version.');
  if (exercises.length < 1) throw new WorkoutScoringError('A scored workout needs exercises.');
  const awards = exercises.map((exercise) => {
    const raw =
      exercise.tracking === 'cardio'
        ? exercise.basePoints *
          (exercise.minutes / 20) *
          (0.75 + (exercise.metricValue / exercise.metricBaseline) * 0.25)
        : exercise.basePoints * exercise.sets * (exercise.reps / 8);
    if (!Number.isFinite(raw) || raw < 0) {
      throw new WorkoutScoringError(`${exercise.name} could not be scored.`);
    }
    return { exerciseName: exercise.name, points: Math.round(raw) };
  });
  return {
    points: awards.reduce((sum, award) => sum + award.points, 0),
    scoringVersion,
    exercises: awards,
  };
}
