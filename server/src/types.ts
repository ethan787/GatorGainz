import type {
  Goal,
  NewWorkoutRequest,
  PointsResponse,
  Ranking,
  ScoringVersion,
  UserSummary,
  Workout,
  WorkoutAward,
  WorkoutHistoryItem,
} from '@gatorgainz/types';
import type { HistoryQuery } from './me/history-query';
import type { ScoredExercise, ScoringResult } from './scoring/score';

/** Validated workout fields shared by create and edit. */
export type WorkoutFields = Pick<
  NewWorkoutRequest,
  'name' | 'category' | 'durationMinutes' | 'completedAt'
>;

/** A validated submission. The award is calculated by the scoring service before storage. */
export interface WorkoutSubmission {
  fields: WorkoutFields;
  /** Present together: retry key and SHA-256 of the normalized submission. */
  submissionKey?: string;
  fingerprint?: string;
  exercises: ScoredExercise[];
  award: ScoringResult | null;
}

export interface SubmittedWorkout {
  workout: Workout;
  award: WorkoutAward | null;
  /** False when the submission key already existed and the original was returned. */
  created: boolean;
}

/** Called inside the edit transaction with the award version already stored, if any. */
export type Rescore = (previousVersion: ScoringVersion | null) => ScoringResult | null;

export class SubmissionKeyConflictError extends Error {
  constructor() {
    super('This submission key was already used for a different workout.');
    this.name = 'SubmissionKeyConflictError';
  }
}

export interface FitnessStore {
  dataSource: 'demo' | 'postgres';
  checkConnection(): Promise<void>;
  getUsers(): Promise<UserSummary[]>;
  getWorkouts(): Promise<Workout[]>;
  /** One user's workouts, newest first. */
  getUserWorkouts(userId: string): Promise<Workout[]>;
  createWorkout(userId: string, workout: WorkoutFields): Promise<Workout>;
  /** Stores a workout, its exercises, and its award atomically. Retries return the original. */
  submitWorkout(userId: string, submission: WorkoutSubmission): Promise<SubmittedWorkout>;
  /** One page of the user's history, newest first. `hasMore` means another page exists. */
  getWorkoutHistory(
    userId: string,
    query: HistoryQuery,
  ): Promise<{ items: WorkoutHistoryItem[]; hasMore: boolean }>;
  /** Replaces an owned workout and its award atomically. Null when not found for this user. */
  updateUserWorkout(
    userId: string,
    workoutId: string,
    fields: WorkoutFields,
    exercises: ScoredExercise[],
    rescore: Rescore,
  ): Promise<SubmittedWorkout | null>;
  /** Deletes an owned workout with its exercises and award. False when not found for this user. */
  deleteUserWorkout(userId: string, workoutId: string): Promise<boolean>;
  /** Sum of the user's persisted awards, with each award. */
  getUserPoints(userId: string): Promise<PointsResponse>;
  getGoals(): Promise<Goal[]>;
  getRankings(): Promise<Ranking[]>;
}
