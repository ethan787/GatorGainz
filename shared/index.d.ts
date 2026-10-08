/** Public API contracts. Never include passwords or password hashes here. */
export interface UserSummary {
  id: string;
  displayName: string;
}

export interface Workout {
  id: string;
  userId: string;
  name: string;
  category: 'strength' | 'cardio' | 'mobility';
  durationMinutes: number;
  completedAt: string;
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
