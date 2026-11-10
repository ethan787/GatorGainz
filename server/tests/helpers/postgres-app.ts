import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createPostgresAuthStore } from '../../src/auth/store';
import { createPostgresStore } from '../../src/data/postgres-store';
import { initializeDatabase } from '../../src/database/setup';

export const databaseUrl = process.env.TEST_DATABASE_URL;
export const describePostgres = databaseUrl ? describe : describe.skip;
export type App = ReturnType<typeof createApp>;

/** A disposable schema with all migrations applied. Dropped in `close()`. */
export async function createTestDatabase(prefix: 'gg_history_test' | 'gg_scoring_test') {
  const schema = `${prefix}_${randomBytes(12).toString('hex')}`;
  if (!/^gg_[a-z]+_test_[a-f0-9]{24}$/.test(schema)) throw new Error('Unsafe test schema name.');
  const adminPool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(databaseUrl!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pools: Pool[] = [];
  const newPool = () => {
    const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
    pools.push(pool);
    return pool;
  };
  const pool = newPool();
  const scope = await pool.query<{ schema: string }>('SELECT current_schema() AS schema');
  if (scope.rows[0].schema !== schema) throw new Error('Test database schema isolation failed.');
  await initializeDatabase(pool);

  /** A fresh API instance with its own connection pool, as after a server restart. */
  const startApi = (apiPool = newPool()) =>
    createApp(createPostgresStore(apiPool), {
      authStore: createPostgresAuthStore(apiPool),
      authRateLimits: { loginMax: 1000, registerMax: 1000 },
    });

  return {
    schema,
    pool,
    newPool,
    startApi,
    async reset() {
      await pool.query(`TRUNCATE TABLE "${schema}".users CASCADE`);
    },
    async close() {
      try {
        await Promise.all(pools.map((p) => p.end().catch(() => {})));
        await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    },
  };
}

function sessionCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((value) => value.startsWith('gatorgainz_session='));
  if (!cookie) throw new Error(`No session cookie (status ${response.status}).`);
  return cookie.split(';')[0];
}

const password = 'correct horse battery staple';

export async function register(app: App, name: string) {
  const email = `${name.toLowerCase()}-${randomBytes(4).toString('hex')}@example.test`;
  const response = await request(app)
    .post('/api/auth/register')
    .set('X-GatorGainz-Request', '1')
    .send({ fullName: name, email, password });
  if (response.status !== 201) throw new Error(`Registration failed: ${response.status}`);
  return { id: response.body.user.id as string, email, cookie: sessionCookie(response) };
}

export async function login(app: App, email: string) {
  const response = await request(app)
    .post('/api/auth/login')
    .set('X-GatorGainz-Request', '1')
    .send({ email, password });
  if (response.status !== 200) throw new Error(`Login failed: ${response.status}`);
  return sessionCookie(response);
}

export async function logout(app: App, cookie: string) {
  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookie)
    .set('X-GatorGainz-Request', '1');
}
