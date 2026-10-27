import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import type { Goal, Ranking, UserSummary, Workout } from '@gatorgainz/types';
import { createApp } from '../src/app';
import { createPostgresStore } from '../src/data/postgres-store';
import { initializeDatabase } from '../src/database/setup';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const alex = '00000000-0000-4000-8000-000000000001';
const jordan = '00000000-0000-4000-8000-000000000002';
const taylor = '00000000-0000-4000-8000-000000000003';

describePostgres('PostgreSQL fitness API validation', () => {
  // Fixtures and constraint checks stay inside a disposable schema, including on failure.
  const schema = `gg_fitness_test_${randomBytes(12).toString('hex')}`;
  let adminPool: Pool;
  let pool: Pool;
  let schemaCreated = false;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    if (!/^gg_fitness_test_[a-f0-9]{24}$/.test(schema)) throw new Error('Unsafe test schema name.');
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const isolatedDatabaseUrl = new URL(databaseUrl!);
    isolatedDatabaseUrl.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({
      connectionString: isolatedDatabaseUrl.toString(),
      connectionTimeoutMillis: 5000,
    });
    const scope = await pool.query<{ schema: string }>('SELECT current_schema() AS schema');
    if (scope.rows[0].schema !== schema) throw new Error('Test database schema isolation failed.');
    await initializeDatabase(pool);
    app = createApp(createPostgresStore(pool));
  }, 30000);

  beforeEach(async () => {
    await pool.query(`TRUNCATE TABLE "${schema}".users CASCADE`);
    await initializeDatabase(pool, { seedDemo: true });
  });

  afterAll(async () => {
    try {
      await pool?.end();
      if (schemaCreated && /^gg_fitness_test_[a-f0-9]{24}$/.test(schema)) {
        await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      await adminPool?.end();
    }
  });

  it('checks a real database connection and identifies PostgreSQL in the health response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', dataSource: 'postgres' });
  });

  it('returns public profiles without emails, password hashes, or account timestamps', async () => {
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      'private-password-hash',
      alex,
    ]);
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: alex, displayName: 'Alex Rivera' },
      { id: jordan, displayName: 'Jordan Lee' },
      { id: taylor, displayName: 'Taylor Morgan' },
    ]);
  });

  it('returns typed workout fields, date-only strings, and newest workouts first', async () => {
    const response = await request(app).get('/api/workouts');
    expect(response.status).toBe(200);
    const workouts = response.body as Workout[];
    expect(workouts).toHaveLength(6);
    const users = (await request(app).get('/api/users')).body as UserSummary[];
    for (const workout of workouts) {
      expect(Object.keys(workout).sort()).toEqual([
        'category',
        'completedAt',
        'durationMinutes',
        'id',
        'name',
        'userId',
      ]);
      expect(users.some((user) => user.id === workout.userId)).toBe(true);
      expect(Number.isInteger(workout.durationMinutes)).toBe(true);
      expect(workout.durationMinutes).toBeGreaterThan(0);
      expect(workout.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const dates = workouts.map((workout) => workout.completedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('counts both goal boundary dates and excludes other users and out-of-range workouts', async () => {
    for (const date of ['2026-10-04', '2026-10-05', '2026-10-11', '2026-10-12']) {
      await pool.query(
        `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at)
         VALUES ($1, 'Boundary workout', 'cardio', 20, $2)`,
        [alex, date],
      );
    }
    await pool.query(
      `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at)
       VALUES ($1, 'Another user workout', 'strength', 30, '2026-10-11')`,
      [jordan],
    );
    const response = await request(app).get('/api/goals');
    expect(response.status).toBe(200);
    const goal = (response.body as Goal[]).find(
      (entry) => entry.id === '20000000-0000-4000-8000-000000000001',
    );
    expect(goal).toMatchObject({
      userId: alex,
      startDate: '2026-10-05',
      targetDate: '2026-10-11',
      targetWorkouts: 4,
      completedWorkouts: 5,
    });
  });

  it('ranks by workout count then minutes, shares tied ranks, and includes zero-workout profiles', async () => {
    await pool.query(
      `INSERT INTO users (display_name, email) VALUES ('Zero Gator', 'zero@example.test')`,
    );
    for (const [user, minutes] of [
      [jordan, 90],
      [taylor, 80],
      [taylor, 70],
    ] as const) {
      await pool.query(
        `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at)
         VALUES ($1, 'Ranking workout', 'cardio', $2, '2026-10-10')`,
        [user, minutes],
      );
    }
    const response = await request(app).get('/api/rankings');
    expect(response.status).toBe(200);
    expect(
      (response.body as Ranking[]).map(({ displayName, rank, totalWorkouts, totalMinutes }) => ({
        displayName,
        rank,
        totalWorkouts,
        totalMinutes,
      })),
    ).toEqual([
      { displayName: 'Alex Rivera', rank: 1, totalWorkouts: 3, totalMinutes: 195 },
      { displayName: 'Jordan Lee', rank: 2, totalWorkouts: 3, totalMinutes: 185 },
      { displayName: 'Taylor Morgan', rank: 2, totalWorkouts: 3, totalMinutes: 185 },
      { displayName: 'Zero Gator', rank: 3, totalWorkouts: 0, totalMinutes: 0 },
    ]);
  });

  it.each([
    ['blank workout name', 'workouts', "name = ' '", '23514'],
    ['invalid workout category', 'workouts', "category = 'invalid'", '23514'],
    ['zero workout duration', 'workouts', 'duration_minutes = 0', '23514'],
    ['negative workout duration', 'workouts', 'duration_minutes = -1', '23514'],
    [
      'unknown workout owner',
      'workouts',
      "user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'",
      '23503',
    ],
    ['blank goal title', 'goals', "title = ' '", '23514'],
    ['zero goal target', 'goals', 'target_workouts = 0', '23514'],
    ['reversed goal dates', 'goals', 'target_date = start_date - 1', '23514'],
  ])('rejects %s at the database boundary', async (_label, table, assignment, code) => {
    // Table names and assignments are fixed fixtures, never request input.
    await expect(pool.query(`UPDATE ${table} SET ${assignment}`)).rejects.toMatchObject({ code });
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM workouts')).rows[0].count,
    ).toBe(6);
    expect((await pool.query('SELECT count(*)::integer AS count FROM goals')).rows[0].count).toBe(
      4,
    );
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('can reapply migrations and demo seeds without duplicating fitness records', async () => {
    expect(await initializeDatabase(pool, { seedDemo: true })).toEqual([]);
    expect((await request(app).get('/api/users')).body).toHaveLength(3);
    expect((await request(app).get('/api/workouts')).body).toHaveLength(6);
    expect((await request(app).get('/api/goals')).body).toHaveLength(4);
  });
});
