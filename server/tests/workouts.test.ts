import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthUser } from '@gatorgainz/types';
import { createApp } from '../src/app';
import { createDemoStore } from '../src/data/demo-store';
import type { AuthStore } from '../src/auth/store';
import { hashSessionToken, SESSION_COOKIE_NAME } from '../src/auth/routes';
import { MAX_WORKOUT_MINUTES, validateNewWorkout } from '../src/workouts/routes';

/** Minimal auth store: only session lookup matters for workout routes. */
class SessionOnlyAuthStore implements AuthStore {
  sessions = new Map<string, { user: AuthUser; expiresAt: Date }>();

  signIn(name: string, expiresInMs = 60_000) {
    const user: AuthUser = {
      id: randomUUID(),
      fullName: name,
      email: `${randomUUID()}@example.com`,
      joinedAt: new Date().toISOString(),
    };
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(hashSessionToken(token), {
      user,
      expiresAt: new Date(Date.now() + expiresInMs),
    });
    return { user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
  }

  async findSessionUser(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    return session && session.expiresAt.getTime() > Date.now() ? session.user : null;
  }

  async registerWithSession(): Promise<AuthUser> {
    throw new Error('not used');
  }
  async findUserByEmail() {
    return null;
  }
  async createSession() {}
  async revokeSession() {}
}

const validWorkout = {
  name: '  Leg day  ',
  category: 'strength',
  durationMinutes: 45,
  completedAt: '2026-10-20',
};

function setup() {
  const store = createDemoStore();
  const authStore = new SessionOnlyAuthStore();
  const app = createApp(store, { authStore });
  return { app, store, authStore };
}

function postWorkout(app: ReturnType<typeof createApp>, cookie: string | null, body: unknown) {
  const req = request(app).post('/api/workouts').set('X-GatorGainz-Request', '1');
  if (cookie) req.set('Cookie', cookie);
  return req.send(body as object);
}

describe('workout storage API (SCRUM-14)', () => {
  it('saves a workout for the signed-in user and returns it', async () => {
    const { app, authStore } = setup();
    const { user, cookie } = authStore.signIn('Krish');
    const response = await postWorkout(app, cookie, validWorkout);
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.workout).toMatchObject({
      userId: user.id,
      name: 'Leg day',
      category: 'strength',
      durationMinutes: 45,
      completedAt: '2026-10-20',
    });
    expect(typeof response.body.workout.id).toBe('string');
  });

  it('ignores any userId in the body and uses the session owner', async () => {
    const { app, authStore } = setup();
    const { user, cookie } = authStore.signIn('Krish');
    const response = await postWorkout(app, cookie, { ...validWorkout, userId: randomUUID() });
    expect(response.status).toBe(201);
    expect(response.body.workout.userId).toBe(user.id);
  });

  it('returns only the signed-in user’s workouts, newest first', async () => {
    const { app, authStore } = setup();
    const me = authStore.signIn('Krish');
    const other = authStore.signIn('Someone else');
    await postWorkout(app, me.cookie, { ...validWorkout, completedAt: '2026-10-01' });
    await postWorkout(app, me.cookie, { ...validWorkout, name: 'Run', category: 'cardio' });
    await postWorkout(app, other.cookie, { ...validWorkout, name: 'Not mine' });

    const response = await request(app).get('/api/workouts/mine').set('Cookie', me.cookie);
    expect(response.status).toBe(200);
    expect(response.body.map((w: { name: string }) => w.name)).toEqual(['Run', 'Leg day']);
    for (const workout of response.body) expect(workout.userId).toBe(me.user.id);
  });

  it('saved workouts count toward rankings', async () => {
    const { app, authStore } = setup();
    const { user, cookie } = authStore.signIn('Krish');
    await postWorkout(app, cookie, validWorkout);
    const workouts = await request(app).get('/api/workouts');
    expect(workouts.body.some((w: { userId: string }) => w.userId === user.id)).toBe(true);
  });

  it('rejects requests without a session', async () => {
    const { app } = setup();
    expect((await postWorkout(app, null, validWorkout)).status).toBe(401);
    expect((await request(app).get('/api/workouts/mine')).status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('Krish', -1);
    const response = await postWorkout(app, cookie, validWorkout);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Please sign in to continue.' });
  });

  it('rejects cross-site writes without the request header or with a foreign origin', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('Krish');
    const noHeader = await request(app)
      .post('/api/workouts')
      .set('Cookie', cookie)
      .send(validWorkout);
    expect(noHeader.status).toBe(403);
    const foreign = await request(app)
      .post('/api/workouts')
      .set('Cookie', cookie)
      .set('X-GatorGainz-Request', '1')
      .set('Origin', 'https://evil.example')
      .send(validWorkout);
    expect(foreign.status).toBe(403);
  });

  it('rejects non-JSON bodies', async () => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('Krish');
    const response = await request(app)
      .post('/api/workouts')
      .set('Cookie', cookie)
      .set('X-GatorGainz-Request', '1')
      .set('Content-Type', 'text/plain')
      .send('name=Leg day');
    expect(response.status).toBe(415);
  });

  it.each([
    ['missing name', { ...validWorkout, name: '   ' }],
    ['long name', { ...validWorkout, name: 'x'.repeat(121) }],
    ['bad category', { ...validWorkout, category: 'yoga' }],
    ['zero minutes', { ...validWorkout, durationMinutes: 0 }],
    ['fractional minutes', { ...validWorkout, durationMinutes: 12.5 }],
    ['too many minutes', { ...validWorkout, durationMinutes: MAX_WORKOUT_MINUTES + 1 }],
    ['minutes as string', { ...validWorkout, durationMinutes: '45' }],
    ['bad date format', { ...validWorkout, completedAt: '10/20/2026' }],
    ['impossible date', { ...validWorkout, completedAt: '2026-02-30' }],
    ['array body', [validWorkout]],
  ])('rejects invalid input: %s', async (_label, body) => {
    const { app, authStore } = setup();
    const { cookie } = authStore.signIn('Krish');
    const response = await postWorkout(app, cookie, body);
    expect(response.status).toBe(400);
    expect(typeof response.body.error).toBe('string');
  });

  it('rejects dates in the future but allows today in time zones ahead of UTC', () => {
    const now = new Date('2026-11-03T23:00:00Z');
    expect('error' in validateNewWorkout({ ...validWorkout, completedAt: '2026-11-04' }, now)).toBe(
      false,
    );
    expect('error' in validateNewWorkout({ ...validWorkout, completedAt: '2026-11-06' }, now)).toBe(
      true,
    );
  });
});
