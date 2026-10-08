import type { FitnessStore } from '../types';
import { demoGoals, demoUsers, demoWorkouts } from './demo';

export const demoStore: FitnessStore = {
  dataSource: 'demo',
  async checkConnection() {},
  async getUsers() {
    return demoUsers;
  },
  async getWorkouts() {
    return demoWorkouts;
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
