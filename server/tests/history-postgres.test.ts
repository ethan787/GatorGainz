import { Pool } from 'pg';
import request from 'supertest';
import type { WorkoutHistoryItem, WorkoutHistoryResponse } from '@gatorgainz/types';
import { createApp } from '../src/app';
import { createPostgresAuthStore } from '../src/auth/store';
import { createPostgresStore } from '../src/data/postgres-store';
import {
  createTestDatabase,
  describePostgres,
  login,
  logout,
  register,
  type App,
} from './helpers/postgres-app';

async function traverse(app: App, cookie: string, query = '') {
  const pages: WorkoutHistoryResponse[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams(query);
    if (cursor) params.set('cursor', cursor);
    const response = await request(app).get(`/api/me/workouts?${params}`).set('Cookie', cookie);
    expect(response.status).toBe(200);
    pages.push(response.body);
    cursor = response.body.pagination.nextCursor;
  } while (cursor);
  return pages;
}

/** 45 workouts across 15 days, three per day, so date ties are common. */
async function seedWorkouts(pool: Pool, userId: string, count: number, prefix: string) {
  for (let i = 0; i < count; i++) {
    const day = String(1 + (i % 15)).padStart(2, '0');
    await pool.query(
      `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at)
       VALUES ($1, $2, 'strength', $3, $4)`,
      [userId, `${prefix} ${i}`, 20 + i, `2026-10-${day}`],
    );
  }
}

describePostgres('PostgreSQL private workout history (GET /api/me/workouts)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: App;

  beforeAll(async () => {
    db = await createTestDatabase('gg_history_test');
    app = db.startApi(db.pool);
  }, 30000);
  beforeEach(() => db.reset());
  afterAll(() => db?.close());

  it('returns only account A’s workouts and every one of them exactly once across 20/20/5', async () => {
    const a = await register(app, 'Alpha');
    const b = await register(app, 'Bravo');
    await seedWorkouts(db.pool, a.id, 45, 'A');
    await seedWorkouts(db.pool, b.id, 7, 'B');

    const pages = await traverse(app, a.cookie);
    expect(pages.map((page) => page.items.length)).toEqual([20, 20, 5]);
    const items = pages.flatMap((page) => page.items);
    expect(items.every((item) => item.userId === a.id)).toBe(true);

    const expected = await db.pool.query<{ id: string }>(
      `SELECT id FROM workouts WHERE user_id = $1
       ORDER BY completed_at DESC, created_at DESC, id DESC`,
      [a.id],
    );
    expect(items.map((item) => item.id)).toEqual(expected.rows.map((row) => row.id));
    expect(new Set(items.map((item) => item.id)).size).toBe(45);

    const bIds = await db.pool.query<{ id: string }>('SELECT id FROM workouts WHERE user_id = $1', [
      b.id,
    ]);
    const returned = new Set(items.map((item) => item.id));
    expect(bIds.rows.filter((row) => returned.has(row.id))).toEqual([]);
  });

  it('breaks identical completion dates and insert timestamps by id', async () => {
    const a = await register(app, 'Alpha');
    await seedWorkouts(db.pool, a.id, 7, 'Tie');
    await db.pool.query(
      `UPDATE workouts SET completed_at = '2026-10-05', created_at = '2026-10-05T12:00:00Z'
       WHERE user_id = $1`,
      [a.id],
    );
    const pages = await traverse(app, a.cookie, 'limit=2');
    expect(pages.map((page) => page.items.length)).toEqual([2, 2, 2, 1]);
    const ids = pages.flatMap((page) => page.items.map((item) => item.id));
    expect(ids).toEqual([...ids].sort().reverse());
    expect(new Set(ids).size).toBe(7);
  });

  it('returns 200 and an empty collection for an account with no workouts', async () => {
    const c = await register(app, 'Charlie');
    const response = await request(app).get('/api/me/workouts').set('Cookie', c.cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      pagination: { limit: 20, hasMore: false, nextCursor: null },
    });
  });

  it('applies inclusive calendar-date boundaries exactly', async () => {
    const a = await register(app, 'Alpha');
    const days = ['2026-09-30', '2026-10-01', '2026-10-10', '2026-10-31', '2026-11-01'];
    for (const day of days) {
      await db.pool.query(
        `INSERT INTO workouts (user_id, name, category, duration_minutes, completed_at)
         VALUES ($1, $2::text, 'cardio', 30, $2::date)`,
        [a.id, day],
      );
    }
    const windows: Array<[string, string]> = [
      ['start=2026-10-01&end=2026-10-31', '2026-10-31,2026-10-10,2026-10-01'],
      ['start=2026-10-01', '2026-11-01,2026-10-31,2026-10-10,2026-10-01'],
      ['end=2026-10-01', '2026-10-01,2026-09-30'],
      ['start=2026-10-10&end=2026-10-10', '2026-10-10'],
      ['start=2026-10-02&end=2026-10-09', ''],
    ];
    for (const [query, expected] of windows) {
      const items = (await traverse(app, a.cookie, `${query}&limit=2`)).flatMap(
        (page) => page.items,
      );
      expect(items.map((item) => item.completedAt).join(',')).toBe(expected);
    }
  });

  it('rejects invalid pagination and filters with a 400 message', async () => {
    const a = await register(app, 'Alpha');
    for (const query of [
      'limit=0',
      'limit=101',
      'page=2',
      'start=2026-02-30',
      'start=2026-10-09&end=2026-10-01',
      'cursor=zzz',
    ]) {
      const response = await request(app).get(`/api/me/workouts?${query}`).set('Cookie', a.cookie);
      expect(response.status).toBe(400);
      expect(response.body.error).toEqual(expect.any(String));
    }
  });

  it('returns 401 for missing, expired, and revoked sessions', async () => {
    expect((await request(app).get('/api/me/workouts')).status).toBe(401);

    const expired = await register(app, 'Expired');
    await db.pool.query(
      `UPDATE auth_sessions SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
       WHERE user_id = $1`,
      [expired.id],
    );
    expect((await request(app).get('/api/me/workouts').set('Cookie', expired.cookie)).status).toBe(
      401,
    );

    const revoked = await register(app, 'Revoked');
    await logout(app, revoked.cookie);
    expect((await request(app).get('/api/me/workouts').set('Cookie', revoked.cookie)).status).toBe(
      401,
    );
  });

  it('keeps identical records after logout/login and after an API restart', async () => {
    const a = await register(app, 'Alpha');
    await seedWorkouts(db.pool, a.id, 45, 'A');
    const before = (await traverse(app, a.cookie)).flatMap((page) => page.items);

    await logout(app, a.cookie);
    const relogged = await login(app, a.email);
    expect((await traverse(app, relogged)).flatMap((page) => page.items)).toEqual(before);

    // New pool and app instance: nothing is held in process memory between "restarts".
    const restarted = db.startApi();
    const newBrowser = await login(restarted, a.email);
    const after: WorkoutHistoryItem[] = (await traverse(restarted, newBrowser)).flatMap(
      (page) => page.items,
    );
    expect(after).toEqual(before);
  });

  it('returns an error, never sample history, when the database is unavailable', async () => {
    const a = await register(app, 'Alpha');
    const deadPool = new Pool({
      connectionString: 'postgresql://nobody@127.0.0.1:1/none',
      connectionTimeoutMillis: 500,
    });
    // Sessions still resolve; the workout query fails.
    const broken = createApp(createPostgresStore(deadPool), {
      authStore: createPostgresAuthStore(db.pool),
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(broken).get('/api/me/workouts').set('Cookie', a.cookie);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Unable to complete the request.' });
      const noAuthDb = createApp(createPostgresStore(deadPool), {
        authStore: createPostgresAuthStore(deadPool),
      });
      expect((await request(noAuthDb).get('/api/me/workouts').set('Cookie', a.cookie)).status).toBe(
        500,
      );
    } finally {
      await deadPool.end();
    }
  });
});
