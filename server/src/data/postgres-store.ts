import { Pool } from 'pg';
import type { Goal, Ranking, UserSummary, Workout } from '@gatorgainz/types';
import type { FitnessStore } from '../types';

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
