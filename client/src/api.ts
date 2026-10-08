import type { Goal, HealthResponse, Ranking, UserSummary, Workout } from '@gatorgainz/types';

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { signal });
  if (!response.ok)
    throw new Error('Unable to load your dashboard. Check that the API is running.');
  return response.json() as Promise<T>;
}

export async function loadDashboard(signal: AbortSignal) {
  const [health, users, workouts, goals, rankings] = await Promise.all([
    get<HealthResponse>('health', signal),
    get<UserSummary[]>('users', signal),
    get<Workout[]>('workouts', signal),
    get<Goal[]>('goals', signal),
    get<Ranking[]>('rankings', signal),
  ]);
  return { health, users, workouts, goals, rankings };
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
