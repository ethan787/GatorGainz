import request from 'supertest';
import {
  createTestDatabase,
  describePostgres,
  login,
  register,
  type App,
} from './helpers/postgres-app';

const H = 'X-GatorGainz-Request';
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new long passphrase';
const TODAY = new Date().toISOString().slice(0, 10);

describePostgres(
  'PostgreSQL account security, onboarding, workout detail, and person lookup',
  () => {
    let db: Awaited<ReturnType<typeof createTestDatabase>>;
    let app: App;

    beforeAll(async () => {
      db = await createTestDatabase('gg_account_test');
      app = db.startApi(db.pool);
    }, 30000);
    beforeEach(() => db.reset());
    afterAll(() => db?.close());

    const get = (cookie: string, path: string) => request(app).get(path).set('Cookie', cookie);
    const send = (
      method: 'post' | 'patch' | 'delete' | 'put',
      cookie: string,
      path: string,
      body?: object,
    ) => {
      const req = request(app)[method](path).set('Cookie', cookie).set(H, '1');
      return body ? req.send(body) : req;
    };
    const loginWith = (email: string, password: string) =>
      request(app).post('/api/auth/login').set(H, '1').send({ email, password });

    describe('password change', () => {
      it('requires the current password and signs out other sessions only', async () => {
        const a = await register(app, 'Alpha');
        const laptop = await login(app, a.email);
        expect((await get(a.cookie, '/api/auth/sessions')).body).toEqual({ activeSessions: 2 });

        const wrong = await send('post', a.cookie, '/api/auth/password', {
          currentPassword: 'not my password at all',
          newPassword: NEW_PASSWORD,
        });
        expect(wrong.status).toBe(403);
        for (const body of [
          { currentPassword: PASSWORD, newPassword: 'too short' },
          { currentPassword: PASSWORD, newPassword: PASSWORD },
          { currentPassword: PASSWORD },
        ]) {
          expect((await send('post', a.cookie, '/api/auth/password', body)).status).toBe(400);
        }

        const ok = await send('post', a.cookie, '/api/auth/password', {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
        });
        expect(ok.status).toBe(204);
        expect((await get(a.cookie, '/api/auth/me')).status).toBe(200);
        expect((await get(laptop, '/api/auth/me')).status).toBe(401);
        expect((await loginWith(a.email, PASSWORD)).status).toBe(401);
        expect((await loginWith(a.email, NEW_PASSWORD)).status).toBe(200);
      });

      it('needs a session', async () => {
        const res = await request(app)
          .post('/api/auth/password')
          .set(H, '1')
          .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
        expect(res.status).toBe(401);
      });
    });

    describe('other sessions', () => {
      it('signs out every other device and keeps this one', async () => {
        const a = await register(app, 'Alpha');
        const phone = await login(app, a.email);
        const tablet = await login(app, a.email);
        const res = await send('post', a.cookie, '/api/auth/sessions/revoke-others');
        expect(res.body).toEqual({ revoked: 2 });
        expect((await get(a.cookie, '/api/auth/me')).status).toBe(200);
        expect((await get(phone, '/api/auth/me')).status).toBe(401);
        expect((await get(tablet, '/api/auth/me')).status).toBe(401);
        expect((await get(a.cookie, '/api/auth/sessions')).body).toEqual({ activeSessions: 1 });
      });
    });

    describe('account deletion', () => {
      it('requires DELETE and the password, then removes everything about the account', async () => {
        const a = await register(app, 'Alpha');
        const b = await register(app, 'Bravo');
        await send('post', a.cookie, '/api/workouts', {
          name: 'Bench',
          category: 'strength',
          durationMinutes: 30,
          completedAt: TODAY,
          submissionKey: 'delete-test-01',
          exercises: [{ name: 'Barbell bench press', sets: 4, reps: 8 }],
        });
        const code = (await get(b.cookie, '/api/me/invite')).body.inviteCode;
        await send('post', a.cookie, '/api/me/connections', { inviteCode: code });

        expect(
          (await send('delete', a.cookie, '/api/auth/account', { password: PASSWORD })).status,
        ).toBe(400);
        expect(
          (
            await send('delete', a.cookie, '/api/auth/account', {
              password: 'wrong password here',
              confirm: 'DELETE',
            })
          ).status,
        ).toBe(403);

        const res = await send('delete', a.cookie, '/api/auth/account', {
          password: PASSWORD,
          confirm: 'DELETE',
        });
        expect(res.status).toBe(204);
        expect(String(res.headers['set-cookie'])).toMatch(/gatorgainz_session=;/);
        expect((await get(a.cookie, '/api/auth/me')).status).toBe(401);
        expect((await loginWith(a.email, PASSWORD)).status).toBe(401);

        const left = await db.pool.query(
          `SELECT (SELECT COUNT(*) FROM users WHERE id = $1)::int AS users,
                (SELECT COUNT(*) FROM workouts WHERE user_id = $1)::int AS workouts,
                (SELECT COUNT(*) FROM workout_awards)::int AS awards,
                (SELECT COUNT(*) FROM workout_exercises)::int AS exercises,
                (SELECT COUNT(*) FROM user_profiles WHERE user_id = $1)::int AS profiles,
                (SELECT COUNT(*) FROM connections)::int AS connections,
                (SELECT COUNT(*) FROM auth_sessions WHERE user_id = $1)::int AS sessions`,
          [a.id],
        );
        expect(left.rows[0]).toEqual({
          users: 0,
          workouts: 0,
          awards: 0,
          exercises: 0,
          profiles: 0,
          connections: 0,
          sessions: 0,
        });
        expect((await get(b.cookie, '/api/me/connections')).body.connected).toEqual([]);
        expect((await get(b.cookie, '/api/auth/me')).status).toBe(200);
      });
    });

    describe('welcome flow', () => {
      it('starts unfinished for new accounts and can only be finished', async () => {
        const a = await register(app, 'Alpha');
        expect((await get(a.cookie, '/api/me/profile')).body.profile.onboarded).toBe(false);
        expect(
          (await send('patch', a.cookie, '/api/me/profile', { onboarded: false })).status,
        ).toBe(400);
        const done = await send('patch', a.cookie, '/api/me/profile', {
          handle: 'alpha_lifts',
          primaryGoal: 'stay_active',
          weeklyGoal: 4,
          visibility: 'private',
          onboarded: true,
        });
        expect(done.status).toBe(200);
        expect(done.body.profile).toMatchObject({
          handle: 'alpha_lifts',
          weeklyGoal: 4,
          visibility: 'private',
          onboarded: true,
        });
        const again = await send('patch', a.cookie, '/api/me/profile', { bio: 'later edit' });
        expect(again.body.profile.onboarded).toBe(true);
      });
    });

    describe('workout detail', () => {
      it('returns saved exercises for the owner only', async () => {
        const a = await register(app, 'Alpha');
        const b = await register(app, 'Bravo');
        const saved = await send('post', a.cookie, '/api/workouts', {
          name: 'Mixed',
          category: 'strength',
          durationMinutes: 60,
          completedAt: TODAY,
          submissionKey: 'detail-test-01',
          exercises: [
            { name: 'Back squat', sets: 3, reps: 10 },
            { name: 'Outdoor run', minutes: 40, metricValue: 6 },
          ],
        });
        const id = saved.body.workout.id;
        const detail = await get(a.cookie, `/api/me/workouts/${id}`);
        expect(detail.status).toBe(200);
        expect(detail.body.workout).toMatchObject({
          id,
          name: 'Mixed',
          points: 160,
          scoringVersion: 'v1',
        });
        expect(detail.body.exercises).toEqual([
          {
            name: 'Back squat',
            group: 'Legs',
            tracking: 'strength',
            sets: 3,
            reps: 10,
            minutes: 0,
            metricValue: 0,
          },
          {
            name: 'Outdoor run',
            group: 'Cardio',
            tracking: 'cardio',
            sets: 0,
            reps: 0,
            minutes: 40,
            metricValue: 6,
          },
        ]);
        expect(detail.body.award.exercises.map((e: { points: number }) => e.points)).toEqual([
          105, 55,
        ]);
        expect((await get(b.cookie, `/api/me/workouts/${id}`)).status).toBe(404);
        expect((await get(a.cookie, '/api/me/workouts/not-a-uuid')).status).toBe(404);
      });
    });

    describe('person lookup', () => {
      it('shows public or connected people and hides private, blocked, and yourself', async () => {
        const a = await register(app, 'Alpha');
        const pub = await register(app, 'Public Person');
        const priv = await register(app, 'Private Person');
        await send('patch', priv.cookie, '/api/me/profile', { visibility: 'private' });

        const seen = await get(a.cookie, `/api/community/people/${pub.id}`);
        expect(seen.status).toBe(200);
        expect(Object.keys(seen.body.person).sort()).toEqual([
          'connection',
          'fullName',
          'handle',
          'level',
          'totalPoints',
          'userId',
        ]);
        expect((await get(a.cookie, `/api/community/people/${priv.id}`)).status).toBe(404);
        expect((await get(a.cookie, `/api/community/people/${a.id}`)).status).toBe(404);

        const code = (await get(priv.cookie, '/api/me/invite')).body.inviteCode;
        await send('post', a.cookie, '/api/me/connections', { inviteCode: code });
        expect(
          (await get(a.cookie, `/api/community/people/${priv.id}`)).body.person.connection,
        ).toBe('connected');

        await send('post', pub.cookie, '/api/me/blocks', { userId: a.id });
        expect((await get(a.cookie, `/api/community/people/${pub.id}`)).status).toBe(404);
        expect((await get(a.cookie, '/api/community/people/bad')).status).toBe(404);
      });
    });
  },
);
