import type { Pool, PoolClient } from 'pg';
import type {
  Goal,
  Ranking,
  ScoringVersion,
  UserSummary,
  Workout,
  WorkoutAward,
  WorkoutHistoryItem,
} from '@gatorgainz/types';
import {
  SubmissionKeyConflictError,
  type FitnessStore,
  type SubmittedWorkout,
  type WorkoutFields,
} from '../types';
import type { ScoredExercise, ScoringResult } from '../scoring/score';

const workoutColumns = `id, user_id AS "userId", name, category,
  duration_minutes AS "durationMinutes", to_char(completed_at, 'YYYY-MM-DD') AS "completedAt"`;
// Microsecond UTC text keeps the cursor exact; a JS Date would drop the last three digits.
const recordedAtColumn = `to_char(w.created_at AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "recordedAt"`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertExercises(client: PoolClient, workoutId: string, exercises: ScoredExercise[]) {
  for (const [position, e] of exercises.entries()) {
    await client.query(
      `INSERT INTO workout_exercises (workout_id, position, name, muscle_group, difficulty,
         base_points, tracking, sets, reps, minutes, metric_value, metric_baseline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        workoutId,
        position,
        e.name,
        e.group,
        e.difficulty,
        e.basePoints,
        e.tracking,
        e.sets,
        e.reps,
        e.minutes,
        e.metricValue,
        e.metricBaseline,
      ],
    );
  }
}

async function upsertAward(client: PoolClient, workoutId: string, award: ScoringResult) {
  await client.query(
    `INSERT INTO workout_awards (workout_id, scoring_version, points, breakdown)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workout_id) DO UPDATE SET scoring_version = EXCLUDED.scoring_version,
       points = EXCLUDED.points, breakdown = EXCLUDED.breakdown, updated_at = now()`,
    [workoutId, award.scoringVersion, award.points, JSON.stringify(award.exercises)],
  );
}

interface AwardRow {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  points: number;
  scoringVersion: ScoringVersion;
  exercises: WorkoutAward['exercises'];
}

const awardSelect = `SELECT w.id AS "workoutId", w.name AS "workoutName",
    to_char(w.completed_at, 'YYYY-MM-DD') AS "completedAt", a.points,
    a.scoring_version AS "scoringVersion", a.breakdown AS exercises
  FROM workout_awards a JOIN workouts w ON w.id = a.workout_id`;

async function readSubmitted(
  client: PoolClient,
  workoutId: string,
  created: boolean,
): Promise<SubmittedWorkout> {
  const workout = await client.query<Workout>(
    `SELECT ${workoutColumns} FROM workouts WHERE id = $1`,
    [workoutId],
  );
  const award = await client.query<AwardRow>(`${awardSelect} WHERE w.id = $1`, [workoutId]);
  return { workout: workout.rows[0], award: award.rows[0] ?? null, created };
}

async function updateWorkoutRow(client: PoolClient, workoutId: string, fields: WorkoutFields) {
  await client.query(
    `UPDATE workouts SET name = $2, category = $3, duration_minutes = $4, completed_at = $5
     WHERE id = $1`,
    [workoutId, fields.name, fields.category, fields.durationMinutes, fields.completedAt],
  );
}

export function createPostgresStore(pool: Pool): FitnessStore {
  return {
    dataSource: 'postgres',
    async checkConnection() {
      await pool.query('SELECT 1');
    },
    async getUsers() {
      const { rows } = await pool.query<UserSummary>(
        'SELECT id, display_name AS "displayName" FROM users ORDER BY display_name, id',
      );
      return rows;
    },
    async getWorkouts() {
      const { rows } = await pool.query<Workout>(`
        SELECT id, user_id AS "userId", name, category,
               duration_minutes AS "durationMinutes", to_char(completed_at, 'YYYY-MM-DD') AS "completedAt"
        FROM workouts ORDER BY completed_at DESC, id
      `);
      return rows;
    },
    async getUserWorkouts(userId) {
      const { rows } = await pool.query<Workout>(
        `SELECT ${workoutColumns} FROM workouts WHERE user_id = $1 ORDER BY completed_at DESC, id`,
        [userId],
      );
      return rows;
    },
    async createWorkout(userId, workout) {
      const { rows } = await pool.query<Workout>(
        `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${workoutColumns}`,
        [userId, workout.name, workout.category, workout.durationMinutes, workout.completedAt],
      );
      return rows[0];
    },
    async submitWorkout(userId, submission) {
      const { fields } = submission;
      return inTransaction(pool, async (client) => {
        // ON CONFLICT waits for a concurrent insert of the same key, so only one row can win.
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at,
             submission_key, submission_fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, submission_key) DO NOTHING RETURNING id`,
          [
            userId,
            fields.name,
            fields.category,
            fields.durationMinutes,
            fields.completedAt,
            submission.submissionKey ?? null,
            submission.fingerprint ?? null,
          ],
        );
        if (inserted.rows.length === 0) {
          const existing = await client.query<{ id: string; fingerprint: string }>(
            `SELECT id, submission_fingerprint AS fingerprint FROM workouts
             WHERE user_id = $1 AND submission_key = $2`,
            [userId, submission.submissionKey],
          );
          if (existing.rows[0].fingerprint !== submission.fingerprint) {
            throw new SubmissionKeyConflictError();
          }
          return readSubmitted(client, existing.rows[0].id, false);
        }
        const workoutId = inserted.rows[0].id;
        await insertExercises(client, workoutId, submission.exercises);
        if (submission.award) await upsertAward(client, workoutId, submission.award);
        return readSubmitted(client, workoutId, true);
      });
    },
    async getWorkoutHistory(userId, query) {
      const params: unknown[] = [userId];
      const where = ['w.user_id = $1'];
      if (query.start) {
        params.push(query.start);
        where.push(`w.completed_at >= $${params.length}::date`);
      }
      if (query.end) {
        params.push(query.end);
        where.push(`w.completed_at <= $${params.length}::date`);
      }
      if (query.after) {
        params.push(query.after.completedAt, query.after.recordedAt, query.after.id);
        const n = params.length;
        where.push(
          `(w.completed_at, w.created_at, w.id) < ($${n - 2}::date, $${n - 1}::timestamptz, $${n}::uuid)`,
        );
      }
      params.push(query.limit + 1);
      const { rows } = await pool.query<WorkoutHistoryItem>(
        `SELECT w.id, w.user_id AS "userId", w.name, w.category,
                w.duration_minutes AS "durationMinutes",
                to_char(w.completed_at, 'YYYY-MM-DD') AS "completedAt", ${recordedAtColumn},
                a.points, a.scoring_version AS "scoringVersion"
         FROM workouts w LEFT JOIN workout_awards a ON a.workout_id = w.id
         WHERE ${where.join(' AND ')}
         ORDER BY w.completed_at DESC, w.created_at DESC, w.id DESC
         LIMIT $${params.length}`,
        params,
      );
      return {
        items: rows.slice(0, query.limit).map((row) => ({
          ...row,
          points: row.points ?? null,
          scoringVersion: row.scoringVersion ?? null,
        })),
        hasMore: rows.length > query.limit,
      };
    },
    async updateUserWorkout(userId, workoutId, fields, exercises, rescore) {
      if (!UUID.test(workoutId)) return null;
      return inTransaction(pool, async (client) => {
        // Row lock serializes concurrent edits/deletes of the same workout.
        const owned = await client.query<{ version: ScoringVersion | null }>(
          `SELECT a.scoring_version AS version FROM workouts w
           LEFT JOIN workout_awards a ON a.workout_id = w.id
           WHERE w.id = $1 AND w.user_id = $2 FOR UPDATE OF w`,
          [workoutId, userId],
        );
        if (owned.rows.length === 0) return null;
        const award = rescore(owned.rows[0].version);
        await updateWorkoutRow(client, workoutId, fields);
        await client.query('DELETE FROM workout_exercises WHERE workout_id = $1', [workoutId]);
        await insertExercises(client, workoutId, exercises);
        if (award) await upsertAward(client, workoutId, award);
        else await client.query('DELETE FROM workout_awards WHERE workout_id = $1', [workoutId]);
        return readSubmitted(client, workoutId, false);
      });
    },
    async deleteUserWorkout(userId, workoutId) {
      if (!UUID.test(workoutId)) return false;
      // Exercises and the award are removed by ON DELETE CASCADE in the same statement.
      const result = await pool.query('DELETE FROM workouts WHERE id = $1 AND user_id = $2', [
        workoutId,
        userId,
      ]);
      return result.rowCount === 1;
    },
    async getUserPoints(userId) {
      // One statement: the total and the breakdown come from the same snapshot.
      const { rows } = await pool.query<AwardRow & { total: string; count: number }>(
        `SELECT t.total, t.count, b.* FROM
           (SELECT COALESCE(SUM(a.points), 0) AS total, COUNT(*)::integer AS count
            FROM workout_awards a JOIN workouts w ON w.id = a.workout_id WHERE w.user_id = $1) t
         LEFT JOIN LATERAL (${awardSelect} WHERE w.user_id = $1
           ORDER BY w.completed_at DESC, w.created_at DESC, w.id DESC) b ON true`,
        [userId],
      );
      const first = rows[0];
      return {
        total: Number(first.total),
        awardedWorkouts: first.count,
        breakdown: rows
          .filter((row) => row.workoutId !== null)
          .map(({ total: _t, count: _c, ...award }) => award),
      };
    },
    async getGoals() {
      const { rows } = await pool.query<Goal>(`
        SELECT g.id, g.user_id AS "userId", g.title, g.target_workouts AS "targetWorkouts",
               to_char(g.start_date, 'YYYY-MM-DD') AS "startDate",
               to_char(g.target_date, 'YYYY-MM-DD') AS "targetDate",
               COUNT(w.id)::integer AS "completedWorkouts"
        FROM goals g LEFT JOIN workouts w
          ON w.user_id = g.user_id AND w.completed_at BETWEEN g.start_date AND g.target_date
        GROUP BY g.id ORDER BY g.target_date, g.id
      `);
      return rows;
    },
    async getRankings() {
      const { rows } = await pool.query<Ranking>(`
        SELECT rank, user_id AS "userId", display_name AS "displayName",
               total_workouts AS "totalWorkouts", total_minutes AS "totalMinutes"
        FROM rankings ORDER BY rank, display_name, user_id
      `);
      return rows;
    },
  };
}
