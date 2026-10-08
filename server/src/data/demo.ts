import type { Goal, UserSummary, Workout } from '@gatorgainz/types';

export const demoUsers: UserSummary[] = [
  { id: '00000000-0000-4000-8000-000000000001', displayName: 'Alex Rivera' },
  { id: '00000000-0000-4000-8000-000000000002', displayName: 'Jordan Lee' },
  { id: '00000000-0000-4000-8000-000000000003', displayName: 'Taylor Morgan' },
];

export const demoWorkouts: Workout[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    userId: demoUsers[0].id,
    name: 'Upper body strength',
    category: 'strength',
    durationMinutes: 60,
    completedAt: '2026-10-08',
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    userId: demoUsers[1].id,
    name: 'Full body strength',
    category: 'strength',
    durationMinutes: 55,
    completedAt: '2026-10-08',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    userId: demoUsers[0].id,
    name: 'Evening run',
    category: 'cardio',
    durationMinutes: 45,
    completedAt: '2026-10-07',
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    userId: demoUsers[2].id,
    name: 'Morning mobility',
    category: 'mobility',
    durationMinutes: 35,
    completedAt: '2026-10-07',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    userId: demoUsers[0].id,
    name: 'Lower body strength',
    category: 'strength',
    durationMinutes: 90,
    completedAt: '2026-10-05',
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    userId: demoUsers[1].id,
    name: 'Campus walk',
    category: 'cardio',
    durationMinutes: 40,
    completedAt: '2026-10-05',
  },
];

export const demoGoals: Omit<Goal, 'completedWorkouts'>[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    userId: demoUsers[0].id,
    title: 'Complete 4 workouts this week',
    targetWorkouts: 4,
    startDate: '2026-10-05',
    targetDate: '2026-10-11',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    userId: demoUsers[0].id,
    title: 'Build a 3-workout foundation',
    targetWorkouts: 3,
    startDate: '2026-10-01',
    targetDate: '2026-10-31',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    userId: demoUsers[1].id,
    title: 'Complete 3 workouts this week',
    targetWorkouts: 3,
    startDate: '2026-10-05',
    targetDate: '2026-10-11',
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    userId: demoUsers[2].id,
    title: 'Make time for 2 workouts',
    targetWorkouts: 2,
    startDate: '2026-10-05',
    targetDate: '2026-10-11',
  },
];
