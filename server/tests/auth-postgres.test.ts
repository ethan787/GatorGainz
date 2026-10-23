import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import request, { type Response } from 'supertest';
import { createApp } from '../src/app';
import { hashPassword, verifyPassword } from '../src/auth/passwords';
import {
  createPostgresAuthStore,
  EmailAlreadyRegisteredError,
  type NewSession,
} from '../src/auth/store';
import { createPostgresStore } from '../src/data/postgres-store';
import { initializeDatabase } from '../src/database/setup';

// Every run gets its own schema. Never truncate or modify an existing application's tables.
const databaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const password = 'a sufficiently long test password';

function newSession(): NewSession {
  return {
    tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

function sessionCookie(response: Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((value) => value.startsWith('gatorgainz_session='));
  if (!cookie) throw new Error('Expected the API to issue its session cookie.');
  return cookie.split(';')[0];
}

describePostgres('PostgreSQL account and session integration', () => {
  const schema = `gg_auth_test_${randomBytes(12).toString('hex')}`;
  let adminPool: Pool;
  let pool: Pool;
  let passwordHash: string;
  let schemaCreated = false;

  function app() {
    return createApp(createPostgresStore(pool), {
      authStore: createPostgresAuthStore(pool),
      authOrigin: 'http://localhost:5173',
      authRateLimits: { loginMax: 100, registerMax: 100 },
    });
  }

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    if (!/^gg_auth_test_[a-f0-9]{24}$/.test(schema)) throw new Error('Unsafe test schema name.');
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    // Connection-string options take precedence over Pool options; set the search path there too.
    const isolatedDatabaseUrl = new URL(databaseUrl!);
    isolatedDatabaseUrl.searchParams.set('options', `-c search_path=${schema}`);
    pool = new Pool({
      connectionString: isolatedDatabaseUrl.toString(),
      connectionTimeoutMillis: 5000,
      options: `-c search_path=${schema}`,
    });
    const scope = await pool.query<{ schema: string }>('SELECT current_schema() AS schema');
    if (scope.rows[0].schema !== schema) throw new Error('Test database schema isolation failed.');
    await initializeDatabase(pool, { seedDemo: false });
    passwordHash = await hashPassword(password);
  }, 30000);

  beforeEach(async () => {
    await pool.query(`TRUNCATE TABLE "${schema}".users CASCADE`);
  });

  afterAll(async () => {
    await pool?.end();
    if (schemaCreated && /^gg_auth_test_[a-f0-9]{24}$/.test(schema)) {
      await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await adminPool?.end();
  });

  it('registers through HTTP, persists only hashes, and authenticates using a fresh app', async () => {
    const response = await request(app())
      .post('/api/auth/register')
      .set('X-GatorGainz-Request', '1')
      .set('Origin', 'http://localhost:5173')
      .send({ fullName: '  River Gator  ', email: ' River@Example.com ', password });
    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({
      id: expect.any(String),
      fullName: 'River Gator',
      email: 'river@example.com',
      joinedAt: expect.any(String),
    });
    expect(response.headers['cache-control']).toContain('no-store');
    const cookie = sessionCookie(response);
    const rawToken = cookie.slice(cookie.indexOf('=') + 1);
    const { rows: users } = await pool.query('SELECT * FROM users');
    const { rows: sessions } = await pool.query('SELECT * FROM auth_sessions');
    expect(users).toHaveLength(1);
    expect(users[0].password_hash).not.toBe(password);
    expect(await verifyPassword(password, users[0].password_hash)).toBe(true);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_hash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(JSON.stringify({ users, sessions })).not.toContain(rawToken);
    expect(JSON.stringify(response.body)).not.toContain('password');
    const restored = await request(app()).get('/api/auth/me').set('Cookie', cookie);
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual(response.body);
  });

  it('can rerun setup without losing registered accounts or sessions', async () => {
    const store = createPostgresAuthStore(pool);
    const session = newSession();
    const user = await store.registerWithSession(
      { fullName: 'Existing Gator', email: 'existing@example.com', passwordHash },
      session,
    );
    expect(await initializeDatabase(pool, { seedDemo: false })).toEqual([]);
    expect(await store.findSessionUser(session.tokenHash)).toEqual(user);
    expect((await store.findUserByEmail(user.email))?.passwordHash).toBe(passwordHash);
  });

  it('rejects a changed migration checksum and leaves accounts and the connection usable', async () => {
    const store = createPostgresAuthStore(pool);
    const session = newSession();
    const user = await store.registerWithSession(
      { fullName: 'Existing Gator', email: 'existing@example.com', passwordHash },
      session,
    );
    const { rows } = await pool.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version LIMIT 1',
    );
    expect(rows).toHaveLength(1);
    const migration = rows[0];
    // Setup reapplies the bootstrap view before checking migration hashes. A failure must
    // roll that replacement back too, rather than leaving part of the setup committed.
    await pool.query(`
      CREATE OR REPLACE VIEW rankings AS
      SELECT 0::integer AS rank, u.id AS user_id, u.display_name,
             0::integer AS total_workouts, 0::integer AS total_minutes
      FROM users u WHERE false
    `);
    try {
      await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2', [
        '0'.repeat(64),
        migration.version,
      ]);
      await expect(initializeDatabase(pool, { seedDemo: false })).rejects.toThrow(
        `Migration ${migration.version} changed after it was applied.`,
      );
      expect(await store.findSessionUser(session.tokenHash)).toEqual(user);
      expect((await store.findUserByEmail(user.email))?.passwordHash).toBe(passwordHash);
      expect((await pool.query('SELECT * FROM rankings')).rows).toHaveLength(0);
    } finally {
      await pool.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2', [
        migration.checksum,
        migration.version,
      ]);
    }
    expect(await initializeDatabase(pool, { seedDemo: false })).toEqual([]);
    expect((await pool.query('SELECT * FROM rankings')).rows).toHaveLength(1);
  });

  it('logs in with persisted credentials, rotates the current session, and revokes it on logout', async () => {
    const store = createPostgresAuthStore(pool);
    const previous = newSession();
    const user = await store.registerWithSession(
      { fullName: 'River Gator', email: 'river@example.com', passwordHash },
      previous,
    );
    // Login through a fresh app exercises persistence rather than an in-memory account list.
    const firstLogin = await request(app())
      .post('/api/auth/login')
      .set('X-GatorGainz-Request', '1')
      .send({ email: 'RIVER@EXAMPLE.COM', password });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.user.id).toBe(user.id);
    const oldCookie = sessionCookie(firstLogin);
    const secondLogin = await request(app())
      .post('/api/auth/login')
      .set('X-GatorGainz-Request', '1')
      .set('Cookie', oldCookie)
      .send({ email: 'river@example.com', password });
    expect(secondLogin.status).toBe(200);
    const cookie = sessionCookie(secondLogin);
    expect(cookie).not.toBe(oldCookie);
    expect((await request(app()).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
    const logout = await request(app())
      .post('/api/auth/logout')
      .set('X-GatorGainz-Request', '1')
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect((await request(app()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    // The independent session originally issued to this account still exists.
    expect(await store.findSessionUser(previous.tokenHash)).toEqual(user);
  });

  it('rejects wrong passwords and demo profiles without creating sessions', async () => {
    const store = createPostgresAuthStore(pool);
    await store.registerWithSession(
      { fullName: 'River Gator', email: 'river@example.com', passwordHash },
      newSession(),
    );
    await pool.query('INSERT INTO users (display_name, email) VALUES ($1, $2)', [
      'Demo Gator',
      'demo@example.com',
    ]);
    for (const email of ['river@example.com', 'demo@example.com', 'missing@example.com']) {
      const response = await request(app())
        .post('/api/auth/login')
        .set('X-GatorGainz-Request', '1')
        .send({ email, password: 'a sufficiently wrong password' });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Email or password is incorrect.' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM auth_sessions')).rows[0].count,
    ).toBe(1);
  });

  it('lets PostgreSQL reject concurrent case-insensitive duplicate registrations', async () => {
    const store = createPostgresAuthStore(pool);
    const outcomes = await Promise.allSettled([
      store.registerWithSession(
        { fullName: 'First Gator', email: 'river@example.com', passwordHash },
        newSession(),
      ),
      store.registerWithSession(
        { fullName: 'Second Gator', email: 'RIVER@example.com', passwordHash },
        newSession(),
      ),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect((await pool.query('SELECT count(*)::integer AS count FROM users')).rows[0].count).toBe(
      1,
    );
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM auth_sessions')).rows[0].count,
    ).toBe(1);
  });

  it('rolls back account creation and preserves a previous session when session insertion fails', async () => {
    const store = createPostgresAuthStore(pool);
    const previous = newSession();
    const original = await store.registerWithSession(
      { fullName: 'Original Gator', email: 'original@example.com', passwordHash },
      previous,
    );
    const collision = newSession();
    await store.createSession(original.id, collision);
    await expect(
      store.registerWithSession(
        { fullName: 'Rolled Back Gator', email: 'rollback@example.com', passwordHash },
        collision,
        previous.tokenHash,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await store.findUserByEmail('rollback@example.com')).toBeNull();
    expect(await store.findSessionUser(previous.tokenHash)).toEqual(original);
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM auth_sessions')).rows[0].count,
    ).toBe(2);
  });

  it('preserves the previous login session if replacement insertion fails', async () => {
    const store = createPostgresAuthStore(pool);
    const previous = newSession();
    const user = await store.registerWithSession(
      { fullName: 'River Gator', email: 'river@example.com', passwordHash },
      previous,
    );
    const collision = newSession();
    await store.createSession(user.id, collision);
    await expect(store.createSession(user.id, collision, previous.tokenHash)).rejects.toMatchObject(
      {
        code: '23505',
      },
    );
    expect(await store.findSessionUser(previous.tokenHash)).toEqual(user);
  });

  it('rejects expired sessions using the database clock and cascades sessions on account deletion', async () => {
    const store = createPostgresAuthStore(pool);
    const session = newSession();
    const user = await store.registerWithSession(
      { fullName: 'River Gator', email: 'river@example.com', passwordHash },
      session,
    );
    await pool.query(
      `UPDATE auth_sessions
       SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
       WHERE token_hash = $1`,
      [session.tokenHash],
    );
    expect(await store.findSessionUser(session.tokenHash)).toBeNull();
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect(
      (await pool.query('SELECT count(*)::integer AS count FROM auth_sessions')).rows[0].count,
    ).toBe(0);
  });
});
