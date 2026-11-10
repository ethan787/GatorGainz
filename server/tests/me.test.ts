import request from 'supertest';
import type { WorkoutHistoryItem, WorkoutHistoryResponse } from '@gatorgainz/types';
import { createApp } from '../src/app';
import { createDemoStore } from '../src/data/demo-store';
import { parseHistoryQuery, encodeCursor } from '../src/me/history-query';
import { SessionOnlyAuthStore } from './helpers/session-auth-store';

type App = ReturnType<typeof createApp>;

function setup() {
  const store = createDemoStore();
  const authStore = new SessionOnlyAuthStore();
  return { app: createApp(store, { authStore }), store, authStore };
}

let keyCounter = 0;
function submit(app: App, cookie: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/workouts')
    .set('Cookie', cookie)
    .set('X-GatorGainz-Request', '1')
    .send({
      name: 'Bench day',
      category: 'strength',
      durationMinutes: 45,
      completedAt: '2026-10-20',
      submissionKey: `unit-key-${++keyCounter}`,
      exercises: [{ name: 'Barbell bench press', sets: 4, reps: 8 }],
      ...overrides,
    });
}

async function allPages(app: App, cookie: string, query = '') {
  const pages: WorkoutHistoryResponse[] = [];
  let cursor: string | null = null;
  do {
    const qs: string = cursor
      ? `?cursor=${cursor}${query ? `&${query}` : ''}`
      : query
        ? `?${query}`
        : '';
    const response = await request(app).get(`/api/me/workouts${qs}`).set('Cookie', cookie);
    expect(response.status).toBe(200);
    pages.push(response.body);
    cursor = response.body.pagination.nextCursor;
  } while (cursor);
  return pages;
}

describe('GET /api/me/workouts (private history)', () => {
  it('returns 200 with an empty collection for an account without workouts', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('New');
    const response = await request(app).get('/api/me/workouts').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      items: [],
      pagination: { limit: 20, hasMore: false, nextCursor: null },
    });
  });

  it('returns only the signed-in account’s workouts, with points and scoring version', async () => {
    const { app, authStore } = setup();
    const a = authStore.signIn('A');
    const b = authStore.signIn('B');
    await submit(app, a.cookie);
    await submit(app, b.cookie, { name: 'B workout' });
    const response = await request(app).get('/api/me/workouts').set('Cookie', a.cookie);
    expect(response.body.items).toHaveLength(1);
    const item: WorkoutHistoryItem = response.body.items[0];
    expect(item).toMatchObject({
      userId: a.user.id,
      name: 'Bench day',
      category: 'strength',
      durationMinutes: 45,
      completedAt: '2026-10-20',
      points: 96,
      scoringVersion: 'v1',
    });
    expect(typeof item.id).toBe('string');
    expect(item.recordedAt).toMatch(/Z$/);
  });

  it('reports unscored workouts with null points', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    await submit(app, cookie, { exercises: undefined, submissionKey: undefined });
    const response = await request(app).get('/api/me/workouts').set('Cookie', cookie);
    expect(response.body.items[0]).toMatchObject({ points: null, scoringVersion: null });
  });

  it('pages 45 workouts newest first, 20/20/5, with no skips or duplicates', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    // Several workouts share a date so the secondary keys are exercised.
    for (let i = 0; i < 45; i++) {
      const day = String(1 + (i % 15)).padStart(2, '0');
      expect((await submit(app, cookie, { completedAt: `2026-10-${day}` })).status).toBe(201);
    }
    const pages = await allPages(app, cookie);
    expect(pages.map((page) => page.items.length)).toEqual([20, 20, 5]);
    expect(pages.map((page) => page.pagination.hasMore)).toEqual([true, true, false]);
    const items = pages.flatMap((page) => page.items);
    expect(new Set(items.map((item) => item.id)).size).toBe(45);
    for (let i = 1; i < items.length; i++) {
      const [prev, next] = [items[i - 1], items[i]];
      const ordered =
        prev.completedAt > next.completedAt ||
        (prev.completedAt === next.completedAt &&
          (prev.recordedAt > next.recordedAt ||
            (prev.recordedAt === next.recordedAt && prev.id > next.id)));
      expect(ordered).toBe(true);
    }
  });

  it('includes both date boundaries and excludes days outside them', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    for (const day of ['2026-10-09', '2026-10-10', '2026-10-15', '2026-10-20', '2026-10-21']) {
      await submit(app, cookie, { completedAt: day, name: day });
    }
    const response = await request(app)
      .get('/api/me/workouts?start=2026-10-10&end=2026-10-20')
      .set('Cookie', cookie);
    expect(response.body.items.map((item: WorkoutHistoryItem) => item.completedAt)).toEqual([
      '2026-10-20',
      '2026-10-15',
      '2026-10-10',
    ]);
    const single = await request(app)
      .get('/api/me/workouts?start=2026-10-15&end=2026-10-15')
      .set('Cookie', cookie);
    expect(single.body.items).toHaveLength(1);
  });

  it('keeps the date window across pages', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    for (let i = 0; i < 6; i++) await submit(app, cookie, { completedAt: '2026-10-10' });
    await submit(app, cookie, { completedAt: '2026-10-11' });
    const pages = await allPages(app, cookie, 'limit=2&end=2026-10-10');
    expect(pages.flatMap((page) => page.items)).toHaveLength(6);
  });

  it.each([
    ['limit=0'],
    ['limit=101'],
    ['limit=abc'],
    ['limit=1.5'],
    ['limit=-1'],
    ['limit=5&limit=6'],
    ['page=2'],
    ['offset=20'],
    ['start=2026-13-01'],
    ['start=2026-02-30'],
    ['start=10/01/2026'],
    ['end=2026-10-01T00:00:00Z'],
    ['start=2026-10-20&end=2026-10-10'],
    ['cursor=not-a-cursor!'],
    ['cursor=eyJ2IjoxfQ'],
  ])('rejects invalid query %s with 400', async (query) => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    const response = await request(app).get(`/api/me/workouts?${query}`).set('Cookie', cookie);
    expect(response.status).toBe(400);
    expect(typeof response.body.error).toBe('string');
  });

  it('rejects changing the date window while following a cursor', () => {
    const cursor = encodeCursor(
      {
        completedAt: '2026-10-10',
        recordedAt: '2026-10-10T00:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000001',
      },
      { limit: 20, start: '2026-10-01' },
    );
    expect(parseHistoryQuery({ cursor, start: '2026-10-02' })).toHaveProperty('error');
    expect(parseHistoryQuery({ cursor, start: '2026-10-01' })).toHaveProperty('query');
    expect(parseHistoryQuery({ cursor })).toMatchObject({ query: { start: '2026-10-01' } });
  });

  it('rejects missing, expired, and revoked sessions with 401', async () => {
    const { app, authStore } = setup();
    expect((await request(app).get('/api/me/workouts')).status).toBe(401);
    const expired = authStore.signIn('Old', -1);
    expect((await request(app).get('/api/me/workouts').set('Cookie', expired.cookie)).status).toBe(
      401,
    );
    const revoked = authStore.signIn('Gone');
    authStore.revoke(revoked.token);
    expect((await request(app).get('/api/me/workouts').set('Cookie', revoked.cookie)).status).toBe(
      401,
    );
    expect((await request(app).get('/api/me/points').set('Cookie', revoked.cookie)).status).toBe(
      401,
    );
  });

  it('returns 503, never demo history, without the account database', async () => {
    const app = createApp(createDemoStore());
    const response = await request(app).get('/api/me/workouts');
    expect(response.status).toBe(503);
    expect(response.body).not.toHaveProperty('items');
  });

  it('returns an error, not sample data, when the store fails', async () => {
    const { store, authStore } = setup();
    store.getWorkoutHistory = async () => {
      throw new Error('connection refused');
    };
    const app = createApp(store, { authStore });
    const { cookie } = authStore.signIn('A');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(app).get('/api/me/workouts').set('Cookie', cookie);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Unable to complete the request.' });
  });
});

describe('server-side points (SCRUM-75)', () => {
  it('awards once when the same submission is retried', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    const first = await submit(app, cookie, { submissionKey: 'retry-key-0001' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      created: true,
      award: { points: 96, scoringVersion: 'v1' },
    });
    for (let i = 0; i < 10; i++) {
      const retry = await submit(app, cookie, { submissionKey: 'retry-key-0001' });
      expect(retry.status).toBe(200);
      expect(retry.body.created).toBe(false);
      expect(retry.body.workout.id).toBe(first.body.workout.id);
    }
    const points = await request(app).get('/api/me/points').set('Cookie', cookie);
    expect(points.body).toMatchObject({ total: 96, awardedWorkouts: 1 });
  });

  it('rejects a reused submission key with different data', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    await submit(app, cookie, { submissionKey: 'reuse-key-0001' });
    const changed = await submit(app, cookie, {
      submissionKey: 'reuse-key-0001',
      exercises: [{ name: 'Deadlift', sets: 5, reps: 5 }],
    });
    expect(changed.status).toBe(409);
  });

  it('lets two accounts use the same submission key independently', async () => {
    const { app, authStore } = setup();
    const a = authStore.signIn('A');
    const b = authStore.signIn('B');
    expect((await submit(app, a.cookie, { submissionKey: 'shared-key-01' })).status).toBe(201);
    expect((await submit(app, b.cookie, { submissionKey: 'shared-key-01' })).status).toBe(201);
  });

  it('ignores a client point total', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    const response = await submit(app, cookie, { points: 100000, award: { points: 100000 } });
    expect(response.body.award.points).toBe(96);
  });

  it('keeps totals consistent through edit and delete, and hides other accounts’ data', async () => {
    const { app, authStore } = setup();
    const a = authStore.signIn('A');
    const b = authStore.signIn('B');
    const bench = await submit(app, a.cookie); // 96
    await submit(app, a.cookie, {
      exercises: [{ name: 'Outdoor run', minutes: 20, metricValue: 3 }],
    }); // 22
    await submit(app, b.cookie, { exercises: [{ name: 'Deadlift', sets: 5, reps: 5 }] });
    const total = async (cookie: string) =>
      (await request(app).get('/api/me/points').set('Cookie', cookie)).body;

    expect((await total(a.cookie)).total).toBe(118);
    const id = bench.body.workout.id;
    const edit = (cookie: string, body: object) =>
      request(app)
        .put(`/api/me/workouts/${id}`)
        .set('Cookie', cookie)
        .set('X-GatorGainz-Request', '1')
        .send(body);
    const fields = {
      name: 'Bench day',
      category: 'strength',
      durationMinutes: 45,
      completedAt: '2026-10-20',
    };

    // B cannot edit, delete, or see A's workout.
    expect(
      (await edit(b.cookie, { ...fields, exercises: [{ name: 'Deadlift', sets: 20, reps: 100 }] }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/me/workouts/${id}`)
          .set('Cookie', b.cookie)
          .set('X-GatorGainz-Request', '1')
      ).status,
    ).toBe(404);
    const bPoints = await total(b.cookie);
    expect(bPoints.breakdown.map((award: { workoutId: string }) => award.workoutId)).not.toContain(
      id,
    );

    const edited = await edit(a.cookie, {
      ...fields,
      exercises: [{ name: 'Barbell bench press', sets: 5, reps: 8 }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.award.points).toBe(120);
    expect((await total(a.cookie)).total).toBe(142);

    const cleared = await edit(a.cookie, fields);
    expect(cleared.body.award).toBeNull();
    expect((await total(a.cookie)).total).toBe(22);

    const deleted = await request(app)
      .delete(`/api/me/workouts/${id}`)
      .set('Cookie', a.cookie)
      .set('X-GatorGainz-Request', '1');
    expect(deleted.status).toBe(204);
    const after = await total(a.cookie);
    expect(after).toMatchObject({ total: 22, awardedWorkouts: 1 });
    expect(after.total).toBe(
      after.breakdown.reduce((sum: number, award: { points: number }) => sum + award.points, 0),
    );
  });

  it('requires the request header on edits and deletes', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('A');
    const response = await request(app).delete('/api/me/workouts/x').set('Cookie', cookie);
    expect(response.status).toBe(403);
  });
});
