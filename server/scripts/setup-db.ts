import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

async function setupDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL in server/.env before running db:setup.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    const schema = await readFile(resolve(__dirname, '../../db/schema.sql'), 'utf8');
    const seed = await readFile(resolve(__dirname, '../../db/seed.sql'), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(schema);
      await client.query(seed);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log('PostgreSQL schema and demo profiles are ready.');
  } finally {
    await pool.end();
  }
}

setupDatabase().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
