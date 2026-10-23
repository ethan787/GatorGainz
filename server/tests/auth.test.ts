import { randomUUID } from 'node:crypto';
import request, { type Response } from 'supertest';
import type { AuthUser } from '@gatorgainz/types';
import { createApp } from '../src/app';
import { demoStore } from '../src/data/demo-store';
import {
  EmailAlreadyRegisteredError,
  type AuthStore,
  type NewAccount,
  type NewSession,
  type StoredAuthUser,
} from '../src/auth/store';
import { hashSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_MS } from '../src/auth/routes';
import * as passwords from '../src/auth/passwords';

const password = 'correct-horse-battery-staple';
const registration = { fullName: '  New Gator  ', email: '  Gator@Example.com  ', password };
let knownPasswordHash: string;

class MemoryAuthStore implements AuthStore {
  accounts = new Map<string, StoredAuthUser>();
  sessions = new Map<string, NewSession & { userId: string }>();

  publicUser(account: StoredAuthUser): AuthUser {
    const { passwordHash: _hash, ...user } = account;
    return user;
  }

  async registerWithSession(account: NewAccount, session: NewSession, previousTokenHash?: string) {
    if (this.accounts.has(account.email)) throw new EmailAlreadyRegisteredError();
    const user = { ...account, id: randomUUID(), joinedAt: new Date().toISOString() };
    this.accounts.set(account.email, user);
    await this.createSession(user.id, session, previousTokenHash);
    return this.publicUser(user);
  }

  async findUserByEmail(email: string) {
    return this.accounts.get(email) ?? null;
  }

  async createSession(userId: string, session: NewSession, previousTokenHash?: string) {
    if (previousTokenHash) this.sessions.delete(previousTokenHash);
    this.sessions.set(session.tokenHash, { ...session, userId });
  }

  async findSessionUser(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const account = [...this.accounts.values()].find((user) => user.id === session.userId);
    return account ? this.publicUser(account) : null;
  }

  async revokeSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  addKnownAccount(email = 'existing@example.com', passwordHash: string | null = knownPasswordHash) {
    const account = {
      id: randomUUID(),
      fullName: 'Existing Gator',
      email,
      passwordHash,
      joinedAt: new Date().toISOString(),
    };
    this.accounts.set(email, account);
    return account;
  }
}

function sessionCookie(response: Response) {
  return (response.headers['set-cookie'] as unknown as string[])[0];
}

function cookiePair(response: Response) {
  return sessionCookie(response).split(';')[0];
}

beforeAll(async () => {
  knownPasswordHash = await passwords.hashPassword(password);
});

afterEach(() => jest.restoreAllMocks());

describe('registration and session API', () => {
  let store: MemoryAuthStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new MemoryAuthStore();
    app = createApp(demoStore, { authStore: store, secureCookies: false });
  });

  function post(path: string) {
    return request(app).post(`/api/auth/${path}`).set('X-GatorGainz-Request', '1');
  }

  it('registers a normalized account with a bcrypt hash and a seven-day HttpOnly session', async () => {
    const start = Date.now();
    const response = await post('register').send(registration);
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ fullName: 'New Gator', email: 'gator@example.com' });
    expect(Object.keys(response.body.user).sort()).toEqual(['email', 'fullName', 'id', 'joinedAt']);
    expect(response.headers['cache-control']).toBe('no-store');
    const account = store.accounts.get('gator@example.com')!;
    expect(account.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    expect(await passwords.verifyPassword(password, account.passwordHash!)).toBe(true);
    const cookie = sessionCookie(response);
    expect(cookie).toMatch(/^gatorgainz_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    const rawToken = cookiePair(response).split('=')[1];
    expect(store.sessions.has(rawToken)).toBe(false);
    const storedSession = store.sessions.get(hashSessionToken(rawToken))!;
    expect(storedSession.expiresAt.getTime()).toBeGreaterThanOrEqual(start + SESSION_TTL_MS);
    expect(storedSession.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookiePair(response));
    expect(me.status).toBe(200);
    expect(me.body).toEqual(response.body);
  });

  it('rejects duplicate emails regardless of case', async () => {
    store.addKnownAccount('gator@example.com');
    const response = await post('register').send(registration);
    expect(response.status).toBe(409);
    expect(store.accounts.size).toBe(1);
    expect(store.sessions.size).toBe(0);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    { fullName: '' },
    { fullName: 'x'.repeat(81) },
    { fullName: 'bad\u0000name' },
    { email: 'invalid-email' },
    { email: 'river@exa\u0000mple.com' },
    { email: 'a'.repeat(250) + '@example.com' },
    { email: 123 },
    { password: 'x'.repeat(14) },
    { password: '🐊'.repeat(8) },
    { password: 'x'.repeat(73) },
    { password: '🐊'.repeat(19) },
    { password: 123 },
  ])('rejects invalid registration fields: %j', async (fields) => {
    const response = await post('register').send({ ...registration, ...fields });
    expect(response.status).toBe(400);
    expect(store.accounts.size).toBe(0);
    expect(store.sessions.size).toBe(0);
  });

  it('logs in with registered credentials and rotates the currently presented session', async () => {
    const registered = await post('register').send(registration);
    const oldCookie = cookiePair(registered);
    const response = await post('login')
      .set('Cookie', oldCookie)
      .send({ email: 'GATOR@example.COM', password });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(registered.body);
    expect(cookiePair(response)).not.toBe(oldCookie);
    expect(store.sessions.size).toBe(1);
    expect((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Cookie', cookiePair(response))).status,
    ).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('revokes a presented session when registering a different account', async () => {
    const first = await post('register').send(registration);
    const second = await post('register')
      .set('Cookie', cookiePair(first))
      .send({ ...registration, email: 'second@example.com' });
    expect(second.status).toBe(201);
    expect(store.sessions.size).toBe(1);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookiePair(first))).status).toBe(
      401,
    );
  });

  it('returns the same failure for unknown emails, wrong passwords, demo profiles, and over-limit input', async () => {
    store.addKnownAccount();
    store.addKnownAccount('demo@example.com', null);
    const attempts = [
      { email: 'missing@example.com', password },
      { email: 'existing@example.com', password: 'incorrect-password' },
      { email: 'demo@example.com', password },
      { email: 'existing@example.com', password: 'x'.repeat(73) },
    ];
    for (const credentials of attempts) {
      const response = await post('login').send(credentials);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Email or password is incorrect.' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(store.sessions.size).toBe(0);
  });

  it('uses a fixed cost-12 bcrypt hash for unknown and passwordless accounts', async () => {
    store.addKnownAccount('demo@example.com', null);
    const verify = jest.spyOn(passwords, 'verifyPassword').mockResolvedValue(false);
    await post('login').send({ email: 'missing@example.com', password });
    await post('login').send({ email: 'demo@example.com', password });
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[0][1]).toMatch(/^\$2b\$12\$/);
    expect(verify.mock.calls[0][1]).toBe(verify.mock.calls[1][1]);
  });

  it('rejects missing, malformed, expired, and unknown session cookies', async () => {
    const response = await post('register').send(registration);
    const token = cookiePair(response).split('=')[1];
    store.sessions.get(hashSessionToken(token))!.expiresAt = new Date(Date.now() - 1000);
    for (const cookie of [
      '',
      `${SESSION_COOKIE_NAME}=bad`,
      cookiePair(response),
      `${SESSION_COOKIE_NAME}=${'a'.repeat(43)}`,
    ]) {
      const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(401);
      expect(me.headers['cache-control']).toBe('no-store');
      expect(sessionCookie(me)).toContain('Expires=Thu, 01 Jan 1970');
    }
  });

  it('logs out by deleting the database session and clearing the cookie, including repeated logout', async () => {
    const registered = await post('register').send(registration);
    const cookie = cookiePair(registered);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await post('logout').set('Cookie', cookie);
      expect(response.status).toBe(204);
      expect(sessionCookie(response)).toContain('Expires=Thu, 01 Jan 1970');
    }
    expect(store.sessions.size).toBe(0);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await post('logout')).status).toBe(204);
  });

  it('sets Secure cookies for HTTPS deployments', async () => {
    app = createApp(demoStore, {
      authStore: store,
      secureCookies: true,
      authOrigin: 'https://gator.example',
    });
    const response = await post('register')
      .set('Origin', 'https://gator.example')
      .send(registration);
    expect(response.status).toBe(201);
    expect(sessionCookie(response)).toContain('Secure');
  });

  it('rejects cross-origin writes and missing request verification headers', async () => {
    app = createApp(demoStore, { authStore: store, authOrigin: 'https://gator.example' });
    for (const route of ['register', 'login', 'logout']) {
      const missingHeader = await request(app).post(`/api/auth/${route}`).send(registration);
      expect(missingHeader.status).toBe(403);
      const crossOrigin = await post(route)
        .set('Origin', 'https://attacker.example')
        .send(registration);
      expect(crossOrigin.status).toBe(403);
      expect(crossOrigin.headers['access-control-allow-origin']).toBeUndefined();
      expect(crossOrigin.headers['cache-control']).toBe('no-store');
    }
    expect(store.accounts.size).toBe(0);
  });

  it('compares Origin with the incoming host when AUTH_ORIGIN is absent', async () => {
    const accepted = await post('register')
      .set('Host', 'localhost:5173')
      .set('Origin', 'http://localhost:5173')
      .send(registration);
    expect(accepted.status).toBe(201);
    const rejected = await post('logout').set('Host', 'localhost:5173').set('Origin', 'null');
    expect(rejected.status).toBe(403);
  });

  it('requires JSON and handles malformed or oversized JSON without leaking details', async () => {
    expect((await post('register').type('form').send({ fullName: 'Example' })).status).toBe(415);
    const malformed = await post('register').type('json').send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'Invalid JSON request body.' });
    expect(malformed.headers['cache-control']).toBe('no-store');
    expect(
      (await post('login').send({ email: 'a@example.com', password: 'x'.repeat(17000) })).status,
    ).toBe(413);
  });

  it('applies independent registration and failed-login rate limits', async () => {
    app = createApp(demoStore, {
      authStore: store,
      authRateLimits: { registerMax: 1, loginMax: 1 },
    });
    expect((await post('register').send({})).status).toBe(400);
    expect((await post('register').send({})).status).toBe(429);
    expect((await post('login').send({})).status).toBe(400);
    const limited = await post('login').send({});
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('returns 503 without a configured auth store instead of creating demo accounts', async () => {
    app = createApp(demoStore);
    for (const route of ['register', 'login', 'logout']) {
      expect((await post(route).send(registration)).status).toBe(503);
    }
    expect((await request(app).get('/api/auth/me')).status).toBe(503);
  });

  it('reports SQL failures generically and does not issue a session cookie', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(store, 'registerWithSession').mockRejectedValue(new Error('secret SQL details'));
    const response = await post('register').send(registration);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Unable to complete the request.' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
