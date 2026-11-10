import request from 'supertest';
import { calculateWorkoutPoints, normalizeExercises } from '../src/scoring/score';
import { createTestDatabase, describePostgres, register, type App } from './helpers/postgres-app';

const fields = {
  name: 'Session',
  category: 'strength',
  durationMinutes: 50,
  completedAt: '2026-10-20',
};
const bench = [{ name: 'Barbell bench press', sets: 4, reps: 8 }]; // 96

function submit(app: App, cookie: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/workouts')
    .set('Cookie', cookie)
    .set('X-GatorGainz-Request', '1')
    .send({ ...fields, ...body });
}

describePostgres('PostgreSQL workout scoring and points (SCRUM-75)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: App;

  beforeAll(async () => {
    db = await createTestDatabase('gg_scoring_test');
    app = db.startApi(db.pool);
  }, 30000);
  beforeEach(() => db.reset());
  afterAll(() => db?.close());

  const counts = async (submissionKey: string) => {
    const { rows } = await db.pool.query<{ workouts: number; awards: number; exercises: number }>(
      `SELECT COUNT(DISTINCT w.id)::int AS workouts, COUNT(DISTINCT a.workout_id)::int AS awards,
              (SELECT COUNT(*)::int FROM workout_exercises e JOIN workouts x ON x.id = e.workout_id
               WHERE x.submission_key = $1) AS exercises
       FROM workouts w LEFT JOIN workout_awards a ON a.workout_id = w.id
       WHERE w.submission_key = $1`,
      [submissionKey],
    );
    return rows[0];
  };

  it('stores the award with its scoring version and exercises', async () => {
    const a = await register(app, 'Alpha');
    const response = await submit(app, a.cookie, {
      submissionKey: 'stored-key-01',
      exercises: bench,
    });
    expect(response.status).toBe(201);
    expect(response.body.award).toMatchObject({
      points: 96,
      scoringVersion: 'v1',
      exercises: [{ exerciseName: 'Barbell bench press', points: 96 }],
    });
    const stored = await db.pool.query('SELECT scoring_version, points FROM workout_awards');
    expect(stored.rows).toEqual([{ scoring_version: 'v1', points: 96 }]);
    expect(await counts('stored-key-01')).toEqual({ workouts: 1, awards: 1, exercises: 1 });
  });

  it('creates exactly one award after 10 sequential retries', async () => {
    const a = await register(app, 'Alpha');
    const statuses: number[] = [];
    const ids = new Set<string>();
    for (let i = 0; i < 11; i++) {
      const response = await submit(app, a.cookie, {
        submissionKey: 'sequential-01',
        exercises: bench,
      });
      statuses.push(response.status);
      ids.add(response.body.workout.id);
    }
    expect(statuses).toEqual([201, ...Array(10).fill(200)]);
    expect(ids.size).toBe(1);
    expect(await counts('sequential-01')).toEqual({ workouts: 1, awards: 1, exercises: 1 });
    const points = await request(app).get('/api/me/points').set('Cookie', a.cookie);
    expect(points.body).toMatchObject({ total: 96, awardedWorkouts: 1 });
  });

  it('creates exactly one award from 10 concurrent attempts', async () => {
    const a = await register(app, 'Alpha');
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        submit(app, a.cookie, { submissionKey: 'concurrent-01', exercises: bench }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    expect(new Set(responses.map((response) => response.body.workout.id)).size).toBe(1);
    expect(await counts('concurrent-01')).toEqual({ workouts: 1, awards: 1, exercises: 1 });
  });

  it('leaves no partial workout or award when the transaction fails, and a retry then succeeds', async () => {
    const a = await register(app, 'Alpha');
    await db.pool.query(`
      CREATE FUNCTION fail_award() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated award failure'; END $$;
      CREATE TRIGGER fail_award BEFORE INSERT ON workout_awards FOR EACH ROW EXECUTE FUNCTION fail_award();
    `);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failed = await submit(app, a.cookie, {
        submissionKey: 'rollback-01',
        exercises: bench,
      });
      expect(failed.status).toBe(500);
      expect(await counts('rollback-01')).toEqual({ workouts: 0, awards: 0, exercises: 0 });
      expect(
        (await db.pool.query('SELECT COUNT(*)::int AS n FROM workout_exercises')).rows[0].n,
      ).toBe(0);
    } finally {
      await db.pool.query('DROP TRIGGER fail_award ON workout_awards; DROP FUNCTION fail_award()');
    }
    const retry = await submit(app, a.cookie, { submissionKey: 'rollback-01', exercises: bench });
    expect(retry.status).toBe(201);
    expect(await counts('rollback-01')).toEqual({ workouts: 1, awards: 1, exercises: 1 });
  });

  it('returns a total that matches an independent sum of the fixture awards', async () => {
    const a = await register(app, 'Alpha');
    const fixtures = [
      bench,
      [{ name: 'Outdoor run', minutes: 20, metricValue: 3 }],
      [
        { name: 'Back squat', sets: 3, reps: 10 },
        { name: 'Outdoor run', minutes: 40, metricValue: 6 },
      ],
      [{ name: 'Rowing machine', minutes: 30, metricValue: 3000 }],
      [
        { name: 'Bicep curls', sets: 1, reps: 5 },
        { name: 'Wrist curls', sets: 1, reps: 1 },
      ],
      [
        { name: 'Swimming laps', minutes: 45, metricValue: 35 },
        { name: 'Deadlift', sets: 5, reps: 5 },
      ],
    ];
    // Independent calculation written out by hand from the v1 formula.
    const handExpected = [
      96,
      22,
      160,
      32,
      9,
      Math.round(25 * (45 / 20) * (0.75 + (35 / 20) * 0.25)) + Math.round(32 * 5 * (5 / 8)),
    ];
    expect(
      fixtures.map((ex) => calculateWorkoutPoints(normalizeExercises(ex), 'v1').points),
    ).toEqual(handExpected);
    for (const [i, exercises] of fixtures.entries()) {
      expect(
        (await submit(app, a.cookie, { submissionKey: `fixture-key-${i}`, exercises })).status,
      ).toBe(201);
    }
    await submit(app, a.cookie, {}); // unscored workout adds nothing
    const response = await request(app).get('/api/me/points').set('Cookie', a.cookie);
    const independent = handExpected.reduce((sum, points) => sum + points, 0);
    expect(response.body.total).toBe(independent);
    expect(response.body.awardedWorkouts).toBe(fixtures.length);
    expect(
      response.body.breakdown.reduce(
        (sum: number, award: { points: number }) => sum + award.points,
        0,
      ),
    ).toBe(independent);
    const sql = await db.pool.query<{ sum: string }>(
      'SELECT SUM(points) AS sum FROM workout_awards',
    );
    expect(Number(sql.rows[0].sum)).toBe(independent);
  });

  it('keeps totals correct after edit and delete and hides one account’s points from another', async () => {
    const a = await register(app, 'Alpha');
    const b = await register(app, 'Bravo');
    const first = await submit(app, a.cookie, { submissionKey: 'edit-key-001', exercises: bench });
    await submit(app, a.cookie, {
      submissionKey: 'edit-key-002',
      exercises: [{ name: 'Outdoor run', minutes: 20, metricValue: 3 }],
    });
    await submit(app, b.cookie, {
      submissionKey: 'edit-key-001',
      exercises: [{ name: 'Deadlift', sets: 5, reps: 5 }],
    });
    const id = first.body.workout.id as string;
    const total = async (cookie: string) =>
      (await request(app).get('/api/me/points').set('Cookie', cookie)).body;
    const put = (cookie: string, body: object) =>
      request(app)
        .put(`/api/me/workouts/${id}`)
        .set('Cookie', cookie)
        .set('X-GatorGainz-Request', '1')
        .send({ ...fields, ...body });
    const del = (cookie: string) =>
      request(app)
        .delete(`/api/me/workouts/${id}`)
        .set('Cookie', cookie)
        .set('X-GatorGainz-Request', '1');

    expect((await total(a.cookie)).total).toBe(118);
    expect((await total(b.cookie)).total).toBe(100);

    // Account B cannot change, delete, or read A's workout or award.
    expect(
      (await put(b.cookie, { exercises: [{ name: 'Deadlift', sets: 20, reps: 100 }] })).status,
    ).toBe(404);
    expect((await del(b.cookie)).status).toBe(404);
    const bView = await request(app).get(`/api/me/points?userId=${a.id}`).set('Cookie', b.cookie);
    expect(bView.body.total).toBe(100);
    expect(
      bView.body.breakdown.map((award: { workoutId: string }) => award.workoutId),
    ).not.toContain(id);
    expect((await total(a.cookie)).total).toBe(118);

    const edited = await put(a.cookie, {
      exercises: [{ name: 'Barbell bench press', sets: 5, reps: 8 }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.award.points).toBe(120);
    expect((await total(a.cookie)).total).toBe(142);
    const exerciseRows = await db.pool.query(
      'SELECT sets FROM workout_exercises WHERE workout_id = $1',
      [id],
    );
    expect(exerciseRows.rows).toEqual([{ sets: 5 }]);

    expect((await del(a.cookie)).status).toBe(204);
    expect(await total(a.cookie)).toMatchObject({ total: 22, awardedWorkouts: 1 });
    const leftovers = await db.pool.query(
      'SELECT (SELECT COUNT(*) FROM workout_awards WHERE workout_id = $1)::int AS awards, (SELECT COUNT(*) FROM workout_exercises WHERE workout_id = $1)::int AS exercises',
      [id],
    );
    expect(leftovers.rows[0]).toEqual({ awards: 0, exercises: 0 });
    expect((await total(b.cookie)).total).toBe(100);
  });

  it('serializes concurrent edits so the stored award matches the stored exercises', async () => {
    const a = await register(app, 'Alpha');
    const first = await submit(app, a.cookie, { submissionKey: 'race-edit-01', exercises: bench });
    const id = first.body.workout.id;
    await Promise.all(
      [3, 4, 5, 6, 7].map((sets) =>
        request(app)
          .put(`/api/me/workouts/${id}`)
          .set('Cookie', a.cookie)
          .set('X-GatorGainz-Request', '1')
          .send({ ...fields, exercises: [{ name: 'Barbell bench press', sets, reps: 8 }] }),
      ),
    );
    const { rows } = await db.pool.query<{ sets: number; points: number }>(
      `SELECT e.sets, a.points FROM workout_exercises e JOIN workout_awards a USING (workout_id)
       WHERE e.workout_id = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].points).toBe(24 * rows[0].sets);
  });
});
