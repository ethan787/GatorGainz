import 'dotenv/config';
import { Pool } from 'pg';
import { createApp } from './app';
import { demoStore } from './data/demo-store';
import { createPostgresStore } from './data/postgres-store';
import { createPostgresAuthStore } from './auth/store';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535.');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 })
  : undefined;
// A configured database failure is reported as an error; it never silently falls back to demo data.
const store = pool ? createPostgresStore(pool) : demoStore;
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_ORIGIN) {
  throw new Error('Set AUTH_ORIGIN to the public HTTPS origin in production.');
}
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_ORIGIN?.startsWith('https://')) {
  throw new Error('AUTH_ORIGIN must use HTTPS in production.');
}
pool?.on('error', (error) => console.error('PostgreSQL connection error:', error.message));
const server = createApp(store, {
  authStore: pool ? createPostgresAuthStore(pool) : undefined,
  authOrigin: process.env.AUTH_ORIGIN,
  secureCookies: process.env.NODE_ENV === 'production',
}).listen(port, '127.0.0.1', () => {
  console.log(`GatorGainz API: http://127.0.0.1:${port} (${store.dataSource} data)`);
});

function shutdown() {
  server.close(() => {
    void (pool?.end() ?? Promise.resolve()).finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
