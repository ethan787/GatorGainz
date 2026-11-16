import request from 'supertest';
import type { PersonCard, ProfileResponse } from '@gatorgainz/types';
import { createApp } from '../src/app';
import { createDemoStore } from '../src/data/demo-store';
import { MAX_REQUESTS_PER_DAY } from '../src/community/store';
import { createTestDatabase, describePostgres, register, type App } from './helpers/postgres-app';

const H = 'X-GatorGainz-Request';
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describePostgres('PostgreSQL profiles, connections, leaderboards, and invites', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: App;
  let keys = 0;

  beforeAll(async () => {
    db = await createTestDatabase('gg_community_test');
    app = db.startApi(db.pool);
  }, 30000);
  beforeEach(() => db.reset());
  afterAll(() => db?.close());

  const get = (cookie: string, path: string) => request(app).get(path).set('Cookie', cookie);
  const send = (
    method: 'post' | 'patch' | 'delete',
    cookie: string,
    path: string,
    body?: object,
  ) => {
    const req = request(app)[method](path).set('Cookie', cookie).set(H, '1');
    return body ? req.send(body) : req;
  };
  const profile = async (cookie: string) =>
    (await get(cookie, `/api/me/profile?today=${TODAY}`)).body as ProfileResponse;
  const logWorkout = (cookie: string, completedAt: string, sets = 4) =>
    send('post', cookie, '/api/workouts', {
      name: 'Bench',
      category: 'strength',
      durationMinutes: 40,
      completedAt,
      submissionKey: `community-key-${++keys}`,
      exercises: [{ name: 'Barbell bench press', sets, reps: 8 }], // 24 points per set
    });
  const handleOf = async (cookie: string) => (await profile(cookie)).profile.handle;
  const connect = async (from: { cookie: string }, to: { cookie: string; id: string }) => {
    expect(
      (
        await send('post', from.cookie, '/api/me/connections', {
          handle: await handleOf(to.cookie),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send(
          'post',
          to.cookie,
          `/api/me/connections/${(await profile(from.cookie)).profile.userId}/accept`,
        )
      ).status,
    ).toBe(200);
  };

  describe('profile', () => {
    it('creates a profile with a username from the name and computes stats from saved workouts', async () => {
      const a = await register(app, 'Luke');
      for (const day of [0, 1, 2, 5])
        expect((await logWorkout(a.cookie, daysAgo(day))).status).toBe(201);
      await logWorkout(a.cookie, daysAgo(40));
      const body = await profile(a.cookie);
      expect(body.profile).toMatchObject({
        fullName: 'Luke',
        handle: 'luke',
        visibility: 'public',
        weeklyGoal: 3,
      });
      expect(body.stats).toMatchObject({
        totalPoints: 96 * 5,
        totalWorkouts: 5,
        scoredWorkouts: 5,
        totalMinutes: 200,
        currentStreakDays: 3,
        longestStreakDays: 3,
        thisWeek: { workouts: 4, points: 384, minutes: 160, goal: 3 },
        favoriteCategory: 'strength',
        level: { level: 1, pointsIntoLevel: 480, pointsPerLevel: 500 },
        globalRank: 1,
      });
      expect(body.stats.last7Days).toHaveLength(7);
      expect(body.stats.last7Days.at(-1)).toEqual({ date: TODAY, workouts: 1, points: 96 });
      expect(body.stats.last7Days.map((d) => d.workouts)).toEqual([0, 1, 0, 0, 1, 1, 1]);
      const earned = body.badges.filter((b) => b.earned).map((b) => b.id);
      expect(earned).toEqual(expect.arrayContaining(['first-workout', 'weekly-goal']));
      expect(earned).not.toContain('streak-7');
    });

    it('gives a second person with the same name a different username', async () => {
      const a = await register(app, 'Luke');
      const b = await register(app, 'Luke');
      expect(await handleOf(a.cookie)).toBe('luke');
      expect(await handleOf(b.cookie)).toMatch(/^luke_\d{4,5}$/);
    });

    it('updates profile fields and rejects bad, reserved, taken, or protected fields', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      const ok = await send('patch', a.cookie, '/api/me/profile', {
        fullName: '  Alpha   Athlete ',
        handle: '@Alpha_1',
        bio: 'Lifting before class.',
        primaryGoal: 'improve_endurance',
        trainingLevel: 'advanced',
        preferredUnits: 'metric',
        weeklyGoal: 5,
        visibility: 'private',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.profile).toMatchObject({
        fullName: 'Alpha Athlete',
        handle: 'alpha_1',
        bio: 'Lifting before class.',
        primaryGoal: 'improve_endurance',
        trainingLevel: 'advanced',
        preferredUnits: 'metric',
        weeklyGoal: 5,
        visibility: 'private',
      });
      expect(ok.body.stats.globalRank).toBeNull();
      const me = await request(app).get('/api/auth/me').set('Cookie', a.cookie);
      expect(me.body.user.fullName).toBe('Alpha Athlete');

      expect((await send('patch', b.cookie, '/api/me/profile', { handle: 'alpha_1' })).status).toBe(
        409,
      );
      for (const bad of [
        { handle: 'ad' },
        { handle: 'admin' },
        { handle: 'has space' },
        { weeklyGoal: 0 },
        { weeklyGoal: 2.5 },
        { visibility: 'friends' },
        { bio: 'x'.repeat(161) },
        { fullName: '' },
        { email: 'new@example.test' },
        { userId: a.id },
        {},
      ]) {
        expect((await send('patch', b.cookie, '/api/me/profile', bad)).status).toBe(400);
      }
    });
  });

  describe('people search and privacy', () => {
    it('finds public accounts by name or username without exposing email', async () => {
      const a = await register(app, 'Alpha');
      await register(app, 'Maya Chen');
      const res = await get(a.cookie, '/api/community/people?q=maya');
      expect(res.status).toBe(200);
      expect(res.body.people).toHaveLength(1);
      expect(Object.keys(res.body.people[0]).sort()).toEqual([
        'connection',
        'fullName',
        'handle',
        'level',
        'totalPoints',
        'userId',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/@example\.test/);
      expect((await get(a.cookie, '/api/community/people?q=maya_chen')).body.people).toHaveLength(
        1,
      );
      expect((await get(a.cookie, '/api/community/people?q=alpha')).body.people).toHaveLength(0); // not yourself
    });

    it('treats search text literally and validates its length', async () => {
      const a = await register(app, 'Alpha');
      await register(app, 'Bravo');
      expect((await get(a.cookie, '/api/community/people?q=%25%25')).body.people).toHaveLength(0);
      expect((await get(a.cookie, '/api/community/people?q=__')).body.people).toHaveLength(0);
      expect((await get(a.cookie, '/api/community/people?q=a')).status).toBe(400);
      expect((await get(a.cookie, `/api/community/people?q=${'a'.repeat(41)}`)).status).toBe(400);
    });

    it('hides private accounts from search and the global board unless connected', async () => {
      const a = await register(app, 'Alpha');
      const p = await register(app, 'Private Person');
      await send('patch', p.cookie, '/api/me/profile', { visibility: 'private' });
      await logWorkout(p.cookie, TODAY);
      expect((await get(a.cookie, '/api/community/people?q=private')).body.people).toHaveLength(0);
      const board = (await get(a.cookie, '/api/community/leaderboard?scope=global&range=all')).body;
      expect(board.entries.map((e: { userId: string }) => e.userId)).not.toContain(p.id);
      // A username request cannot reach a private account.
      const handle = await handleOf(p.cookie);
      expect((await send('post', a.cookie, '/api/me/connections', { handle })).status).toBe(404);
      // An invite link from that person can.
      const code = (await get(p.cookie, '/api/me/invite')).body.inviteCode;
      expect(
        (await send('post', a.cookie, '/api/me/connections', { inviteCode: code })).body.person
          .connection,
      ).toBe('connected');
      expect((await get(a.cookie, '/api/community/people?q=private')).body.people).toHaveLength(1);
      const friends = (
        await get(a.cookie, '/api/community/leaderboard?scope=connections&range=all')
      ).body;
      expect(friends.entries.map((e: { userId: string }) => e.userId)).toContain(p.id);
    });
  });

  describe('connections', () => {
    it('requires the other person to accept a request', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      const req = await send('post', a.cookie, '/api/me/connections', {
        handle: await handleOf(b.cookie),
      });
      expect(req.status).toBe(201);
      expect(req.body.person.connection).toBe('outgoing');
      expect(
        (await get(b.cookie, '/api/me/connections')).body.incoming.map((p: PersonCard) => p.userId),
      ).toEqual([a.id]);
      // The requester cannot accept their own request.
      expect((await send('post', a.cookie, `/api/me/connections/${b.id}/accept`)).status).toBe(404);
      const accepted = await send('post', b.cookie, `/api/me/connections/${a.id}/accept`);
      expect(accepted.body.person.connection).toBe('connected');
      expect(
        (await get(a.cookie, '/api/me/connections')).body.connected.map(
          (p: PersonCard) => p.userId,
        ),
      ).toEqual([b.id]);
      expect((await profile(a.cookie)).connectionCount).toBe(1);
    });

    it('accepts automatically when both people ask each other, and is idempotent', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      await send('post', a.cookie, '/api/me/connections', { handle: await handleOf(b.cookie) });
      const again = await send('post', a.cookie, '/api/me/connections', {
        handle: await handleOf(b.cookie),
      });
      expect(again.body.person.connection).toBe('outgoing');
      const back = await send('post', b.cookie, '/api/me/connections', {
        handle: await handleOf(a.cookie),
      });
      expect(back.body.person.connection).toBe('connected');
      const rows = await db.pool.query('SELECT status FROM connections');
      expect(rows.rows).toEqual([{ status: 'accepted' }]);
    });

    it('keeps one row when both people ask at the same moment', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      const [ha, hb] = [await handleOf(a.cookie), await handleOf(b.cookie)];
      await Promise.all([
        send('post', a.cookie, '/api/me/connections', { handle: hb }),
        send('post', b.cookie, '/api/me/connections', { handle: ha }),
      ]);
      const rows = await db.pool.query('SELECT status FROM connections');
      expect(rows.rows).toEqual([{ status: 'accepted' }]);
    });

    it('lets either side decline, cancel, or disconnect', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      await send('post', a.cookie, '/api/me/connections', { handle: await handleOf(b.cookie) });
      expect((await send('delete', b.cookie, `/api/me/connections/${a.id}`)).status).toBe(204);
      expect((await get(a.cookie, '/api/me/connections')).body.outgoing).toEqual([]);
      expect((await send('delete', b.cookie, `/api/me/connections/${a.id}`)).status).toBe(404);
    });

    it('rejects yourself, unknown usernames, bad input, and too many requests', async () => {
      const a = await register(app, 'Alpha');
      expect(
        (await send('post', a.cookie, '/api/me/connections', { handle: await handleOf(a.cookie) }))
          .status,
      ).toBe(400);
      expect(
        (await send('post', a.cookie, '/api/me/connections', { handle: 'nobody_here' })).status,
      ).toBe(404);
      expect((await send('post', a.cookie, '/api/me/connections', { handle: 'x' })).status).toBe(
        400,
      );
      expect((await send('post', a.cookie, '/api/me/connections', {})).status).toBe(400);
      expect(
        (
          await send('post', a.cookie, '/api/me/connections', {
            handle: 'alpha',
            inviteCode: 'abcdefghijkl',
          })
        ).status,
      ).toBe(400);
      // Many public accounts, inserted directly to keep the test fast.
      await db.pool.query(
        `WITH u AS (INSERT INTO users (display_name, email, password_hash)
           SELECT 'Spam ' || n, 'spam' || n || '@example.test', 'x' FROM generate_series(1, $1) n RETURNING id, email)
         INSERT INTO user_profiles (user_id, handle, invite_code)
         SELECT id, 'spam_' || split_part(split_part(email, '@', 1), 'spam', 2), 'code' || lpad(split_part(split_part(email, '@', 1), 'spam', 2), 10, '0') FROM u`,
        [MAX_REQUESTS_PER_DAY + 1],
      );
      for (let n = 1; n <= MAX_REQUESTS_PER_DAY; n++) {
        expect(
          (await send('post', a.cookie, '/api/me/connections', { handle: `spam_${n}` })).status,
        ).toBe(201);
      }
      const limited = await send('post', a.cookie, '/api/me/connections', {
        handle: `spam_${MAX_REQUESTS_PER_DAY + 1}`,
      });
      expect(limited.status).toBe(429);
    });

    it('blocking removes the connection and hides both people from each other', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      await connect(a, b);
      expect((await send('post', b.cookie, '/api/me/blocks', { userId: a.id })).status).toBe(204);
      expect((await get(a.cookie, '/api/me/connections')).body.connected).toEqual([]);
      expect((await get(a.cookie, '/api/community/people?q=bravo')).body.people).toEqual([]);
      expect((await get(b.cookie, '/api/community/people?q=alpha')).body.people).toEqual([]);
      const handle = await handleOf(b.cookie);
      expect((await send('post', a.cookie, '/api/me/connections', { handle })).status).toBe(404);
      const code = (await get(b.cookie, '/api/me/invite')).body.inviteCode;
      expect(
        (await send('post', a.cookie, '/api/me/connections', { inviteCode: code })).status,
      ).toBe(404);
      const board = (await get(a.cookie, '/api/community/leaderboard?range=all')).body;
      expect(board.entries.map((e: { userId: string }) => e.userId)).not.toContain(b.id);
      expect((await get(b.cookie, '/api/me/blocks')).body.blocked).toEqual([
        { userId: a.id, fullName: 'Alpha', handle: await handleOf(a.cookie) },
      ]);
      expect((await send('delete', b.cookie, `/api/me/blocks/${a.id}`)).status).toBe(204);
      expect((await get(a.cookie, '/api/community/people?q=bravo')).body.people).toHaveLength(1);
      expect((await send('post', a.cookie, '/api/me/blocks', { userId: a.id })).status).toBe(400);
    });
  });

  describe('leaderboards', () => {
    it('ranks by server-awarded points within the range and always includes you', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      const c = await register(app, 'Charlie');
      await logWorkout(a.cookie, TODAY, 2); // 48
      await logWorkout(b.cookie, TODAY, 5); // 120
      await logWorkout(b.cookie, daysAgo(20), 10); // 240, outside the week
      await logWorkout(c.cookie, daysAgo(60), 10); // 240, outside the month

      const week = (
        await get(a.cookie, `/api/community/leaderboard?scope=global&range=week&today=${TODAY}`)
      ).body;
      expect(week.since).toBe(daysAgo(6));
      expect(
        week.entries.map((e: { fullName: string; points: number; rank: number }) => [
          e.fullName,
          e.points,
          e.rank,
        ]),
      ).toEqual([
        ['Bravo', 120, 1],
        ['Alpha', 48, 2],
        ['Charlie', 0, 3],
      ]);
      expect(week.you).toMatchObject({ userId: a.id, rank: 2, isYou: true });
      expect(week.boardPoints).toBe(168);
      expect(week.members).toBe(3);

      const month = (await get(a.cookie, '/api/community/leaderboard?range=month')).body;
      expect(month.entries[0]).toMatchObject({ fullName: 'Bravo', points: 360 });
      const all = (await get(a.cookie, '/api/community/leaderboard?range=all')).body;
      expect(all.entries.map((e: { points: number }) => e.points)).toEqual([360, 240, 48]);

      const friends = (
        await get(a.cookie, '/api/community/leaderboard?scope=connections&range=all')
      ).body;
      expect(friends.entries.map((e: { userId: string }) => e.userId)).toEqual([a.id]);
      await connect(a, b);
      const after = (await get(a.cookie, '/api/community/leaderboard?scope=connections&range=all'))
        .body;
      expect(after.entries.map((e: { userId: string }) => e.userId)).toEqual([b.id, a.id]);

      expect((await get(a.cookie, '/api/community/leaderboard?range=year')).status).toBe(400);
      expect((await get(a.cookie, '/api/community/leaderboard?scope=everyone')).status).toBe(400);
    });
  });

  describe('invites', () => {
    it('previews, connects through, and invalidates invite links', async () => {
      const a = await register(app, 'Alpha');
      const b = await register(app, 'Bravo');
      const code = (await get(a.cookie, '/api/me/invite')).body.inviteCode as string;
      expect(code).toMatch(/^[A-Za-z0-9_-]{12,16}$/);
      const preview = await request(app).get(`/api/invites/${code}`);
      expect(preview.status).toBe(200);
      expect(preview.body).toEqual({ fullName: 'Alpha', handle: await handleOf(a.cookie) });

      const joined = await send('post', b.cookie, '/api/me/connections', { inviteCode: code });
      expect(joined.status).toBe(201);
      expect(joined.body.person).toMatchObject({ userId: a.id, connection: 'connected' });
      // Using your own link does nothing.
      expect(
        (await send('post', a.cookie, '/api/me/connections', { inviteCode: code })).status,
      ).toBe(400);

      const fresh = (await send('post', a.cookie, '/api/me/invite')).body.inviteCode;
      expect(fresh).not.toBe(code);
      expect((await request(app).get(`/api/invites/${code}`)).status).toBe(404);
      expect((await request(app).get(`/api/invites/${fresh}`)).status).toBe(200);
      expect((await request(app).get('/api/invites/bad!code')).status).toBe(404);
    });
  });

  it('requires a session for every private route', async () => {
    for (const path of [
      '/api/me/profile',
      '/api/me/connections',
      '/api/me/invite',
      '/api/me/blocks',
      '/api/community/people?q=ab',
      '/api/community/leaderboard',
    ]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect(
      (await request(app).patch('/api/me/profile').set(H, '1').send({ bio: 'x' })).status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/me/connections').set(H, '1').send({ handle: 'abc' })).status,
    ).toBe(401);
  });

  it('returns 503 without PostgreSQL', async () => {
    const demo = createApp(createDemoStore());
    expect((await request(demo).get('/api/community/leaderboard')).status).toBe(503);
    expect((await request(demo).get('/api/invites/abcdefghijkl')).status).toBe(503);
    expect((await request(demo).get('/api/me/profile')).status).toBe(503);
    expect((await request(demo).get('/api/goals')).status).toBe(200);
    expect((await request(demo).get('/api/nope')).status).toBe(404);
  });
});
