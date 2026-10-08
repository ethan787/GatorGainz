import type { Goal, Ranking, UserSummary, Workout } from '@gatorgainz/types';

export interface FitnessStore {
  dataSource: 'demo' | 'postgres';
  checkConnection(): Promise<void>;
  getUsers(): Promise<UserSummary[]>;
  getWorkouts(): Promise<Workout[]>;
  getGoals(): Promise<Goal[]>;
  getRankings(): Promise<Ranking[]>;
}
