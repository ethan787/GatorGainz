import type { Goal, NewWorkoutRequest, Ranking, UserSummary, Workout } from '@gatorgainz/types';

export interface FitnessStore {
  dataSource: 'demo' | 'postgres';
  checkConnection(): Promise<void>;
  getUsers(): Promise<UserSummary[]>;
  getWorkouts(): Promise<Workout[]>;
  /** One user's workouts, newest first. */
  getUserWorkouts(userId: string): Promise<Workout[]>;
  createWorkout(userId: string, workout: NewWorkoutRequest): Promise<Workout>;
  getGoals(): Promise<Goal[]>;
  getRankings(): Promise<Ranking[]>;
}
