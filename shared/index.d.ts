/** Public API contracts. Never include passwords or password hashes here. */
export interface UserSummary {
  id: string;
  displayName: string;
}

/** The signed-in user's profile. Passwords and session tokens never appear in JSON. */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  joinedAt: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Workout {
  id: string;
  userId: string;
  name: string;
  category: 'strength' | 'cardio' | 'mobility';
  durationMinutes: number;
  completedAt: string;
}

/** Body for POST /api/workouts. The owner always comes from the session, never the body. */
export interface NewWorkoutRequest {
  name: string;
  category: Workout['category'];
  durationMinutes: number;
  completedAt: string;
  /**
   * Client-generated retry key (8–128 of A–Z, a–z, 0–9, _ or -). Required when
   * `exercises` is sent. Retrying with the same key returns the original workout.
   */
  submissionKey?: string;
  /** Exercises to score on the server. Without exercises the workout earns no award. */
  exercises?: WorkoutExerciseInput[];
}

/** Body for PUT /api/me/workouts/:id. Replaces the workout's fields and exercises. */
export type UpdateWorkoutRequest = Omit<NewWorkoutRequest, 'submissionKey'>;

export interface WorkoutResponse {
  workout: Workout;
}

// ---- Scoring (SCRUM-75) ----

export type ScoringVersion = 'v1';

/** One catalog entry of the approved scoring configuration. */
export interface ExerciseDefinition {
  name: string;
  group: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  points: number;
  tracking?: 'strength' | 'cardio';
  cardioMetric?: {
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    initial: number;
    baseline: number;
  };
}

/** What the client sends per exercise. Strength uses sets/reps; cardio uses minutes/metricValue. */
export interface WorkoutExerciseInput {
  name: string;
  sets?: number;
  reps?: number;
  minutes?: number;
  metricValue?: number;
}

export interface ExerciseAward {
  exerciseName: string;
  points: number;
}

/** One workout's server-calculated award. */
export interface WorkoutAward {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  points: number;
  scoringVersion: ScoringVersion;
  exercises: ExerciseAward[];
}

/** POST /api/workouts response when exercises are scored; `award` is null for unscored workouts. */
export interface ScoredWorkoutResponse extends WorkoutResponse {
  award: WorkoutAward | null;
  /** False when a retry with the same submission key returned the existing workout. */
  created: boolean;
}

/** GET /api/me/points. `total` is the sum of the persisted per-workout awards. */
export interface PointsResponse {
  total: number;
  awardedWorkouts: number;
  breakdown: WorkoutAward[];
}

// ---- Private workout history ----

export interface WorkoutHistoryItem extends Workout {
  /** When the server stored the workout (ISO 8601, UTC). Second sort key after completedAt. */
  recordedAt: string;
  /** Server-awarded points, or null when the workout has no exercises to score. */
  points: number | null;
  scoringVersion: ScoringVersion | null;
}

/** GET /api/me/workouts */
export interface WorkoutHistoryResponse {
  items: WorkoutHistoryItem[];
  pagination: {
    limit: number;
    hasMore: boolean;
    /** Pass as `cursor` to get the next page; null on the last page. */
    nextCursor: string | null;
  };
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  targetWorkouts: number;
  completedWorkouts: number;
  startDate: string;
  targetDate: string;
}

export interface Ranking {
  rank: number;
  userId: string;
  displayName: string;
  totalWorkouts: number;
  totalMinutes: number;
}

export interface HealthResponse {
  status: 'ok';
  dataSource: 'demo' | 'postgres';
}
