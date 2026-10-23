import 'dotenv/config';
import { Pool } from 'pg';
import { initializeDatabase } from '../src/database/setup';

async function setupDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL in server/.env before running db:setup.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    const seedDemo = process.argv.includes('--seed');
    const applied = await initializeDatabase(pool, { seedDemo });
    console.log(`PostgreSQL schema is ready. Applied ${applied.length} new migration(s).`);
    if (seedDemo) console.log('Synthetic demo profiles were added.');
  } finally {
    await pool.end();
  }
}

setupDatabase().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
