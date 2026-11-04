import { randomUUID } from 'node:crypto';
import type { Workout } from '@gatorgainz/types';
import type { FitnessStore } from '../types';
import { demoGoals, demoUsers, demoWorkouts as initialWorkouts } from './demo';

function newestFirst(a: Workout, b: Workout) {
  return b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id);
}

/** In-memory store. Each call gets its own copy so writes never leak between instances. */
export function createDemoStore(): FitnessStore {
  const demoWorkouts: Workout[] = initialWorkouts.map((workout) => ({ ...workout }));
  return {
    dataSource: 'demo',
    async checkConnection() {},
    async getUsers() {
      return demoUsers;
    },
    async getWorkouts() {
      return demoWorkouts;
    },
    async getUserWorkouts(userId) {
      return demoWorkouts.filter((workout) => workout.userId === userId).sort(newestFirst);
    },
    async createWorkout(userId, input) {
      const workout: Workout = { id: randomUUID(), userId, ...input };
      demoWorkouts.push(workout);
      return workout;
    },
    async getGoals() {
      return demoGoals.map((goal) => ({
        ...goal,
        completedWorkouts: demoWorkouts.filter(
          (workout) =>
            workout.userId === goal.userId &&
            workout.completedAt >= goal.startDate &&
            workout.completedAt <= goal.targetDate,
        ).length,
      }));
    },
    async getRankings() {
      const totals = demoUsers
        .map((user) => {
          const workouts = demoWorkouts.filter((workout) => workout.userId === user.id);
          return {
            userId: user.id,
            displayName: user.displayName,
            totalWorkouts: workouts.length,
            totalMinutes: workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0),
          };
        })
        .sort(
          (a, b) =>
            b.totalWorkouts - a.totalWorkouts ||
            b.totalMinutes - a.totalMinutes ||
            a.displayName.localeCompare(b.displayName),
        );
      let rank = 0;
      return totals.map((entry, index) => {
        const previous = totals[index - 1];
        if (
          !previous ||
          previous.totalWorkouts !== entry.totalWorkouts ||
          previous.totalMinutes !== entry.totalMinutes
        )
          rank += 1;
        return { ...entry, rank };
      });
    },
  };
}

export const demoStore = createDemoStore();
