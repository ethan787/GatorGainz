import { randomUUID } from 'node:crypto';
import type { Workout, WorkoutAward } from '@gatorgainz/types';
import { compareHistoryDescending } from '../me/history-query';
import type { ScoredExercise, ScoringResult } from '../scoring/score';
import { SubmissionKeyConflictError, type FitnessStore, type SubmittedWorkout } from '../types';
import { demoGoals, demoUsers, demoWorkouts as initialWorkouts } from './demo';

function newestFirst(a: Workout, b: Workout) {
  return b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id);
}

/** In-memory store. Each call gets its own copy so writes never leak between instances. */
export function createDemoStore(): FitnessStore {
  const demoWorkouts: Workout[] = initialWorkouts.map((workout) => ({ ...workout }));
  // Private per-workout data, mirroring the PostgreSQL columns and tables.
  const details = new Map<
    string,
    {
      recordedAt: string;
      submissionKey?: string;
      fingerprint?: string;
      exercises: ScoredExercise[];
      award: ScoringResult | null;
    }
  >(
    demoWorkouts.map((w) => [
      w.id,
      { recordedAt: '2026-10-01T00:00:00.000Z', exercises: [], award: null },
    ]),
  );

  function awardFor(workout: Workout): WorkoutAward | null {
    const award = details.get(workout.id)?.award;
    return award
      ? {
          workoutId: workout.id,
          workoutName: workout.name,
          completedAt: workout.completedAt,
          points: award.points,
          scoringVersion: award.scoringVersion,
          exercises: award.exercises,
        }
      : null;
  }
  const result = (workout: Workout, created: boolean): SubmittedWorkout => ({
    workout: { ...workout },
    award: awardFor(workout),
    created,
  });
  const historyItem = (workout: Workout) => {
    const detail = details.get(workout.id)!;
    return {
      ...workout,
      recordedAt: detail.recordedAt,
      points: detail.award?.points ?? null,
      scoringVersion: detail.award?.scoringVersion ?? null,
    };
  };
  const owned = (userId: string, workoutId: string) =>
    demoWorkouts.find((w) => w.id === workoutId && w.userId === userId);

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
      details.set(workout.id, { recordedAt: new Date().toISOString(), exercises: [], award: null });
      return workout;
    },
    async submitWorkout(userId, submission) {
      if (submission.submissionKey) {
        const existing = demoWorkouts.find(
          (w) =>
            w.userId === userId && details.get(w.id)?.submissionKey === submission.submissionKey,
        );
        if (existing) {
          if (details.get(existing.id)!.fingerprint !== submission.fingerprint) {
            throw new SubmissionKeyConflictError();
          }
          return result(existing, false);
        }
      }
      const workout: Workout = { id: randomUUID(), userId, ...submission.fields };
      demoWorkouts.push(workout);
      details.set(workout.id, {
        recordedAt: new Date().toISOString(),
        submissionKey: submission.submissionKey,
        fingerprint: submission.fingerprint,
        exercises: submission.exercises,
        award: submission.award,
      });
      return result(workout, true);
    },
    async getWorkoutHistory(userId, query) {
      const matching = demoWorkouts
        .filter(
          (w) =>
            w.userId === userId &&
            (!query.start || w.completedAt >= query.start) &&
            (!query.end || w.completedAt <= query.end),
        )
        .map(historyItem)
        .sort(compareHistoryDescending)
        .filter((item) => !query.after || compareHistoryDescending(query.after, item) < 0);
      return {
        items: matching.slice(0, query.limit),
        hasMore: matching.length > query.limit,
      };
    },
    async updateUserWorkout(userId, workoutId, fields, exercises, rescore) {
      const workout = owned(userId, workoutId);
      if (!workout) return null;
      const detail = details.get(workoutId)!;
      const award = rescore(detail.award?.scoringVersion ?? null);
      Object.assign(workout, fields);
      details.set(workoutId, { ...detail, exercises, award });
      return result(workout, false);
    },
    async deleteUserWorkout(userId, workoutId) {
      const workout = owned(userId, workoutId);
      if (!workout) return false;
      demoWorkouts.splice(demoWorkouts.indexOf(workout), 1);
      details.delete(workoutId);
      return true;
    },
    async getUserPoints(userId) {
      const awards = demoWorkouts
        .filter((w) => w.userId === userId)
        .map(historyItem)
        .sort(compareHistoryDescending)
        .map((item) => awardFor(item))
        .filter((award): award is WorkoutAward => award !== null);
      return {
        total: awards.reduce((sum, award) => sum + award.points, 0),
        awardedWorkouts: awards.length,
        breakdown: awards,
      };
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
