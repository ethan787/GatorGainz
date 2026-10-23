import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const databaseDirectory = resolve(__dirname, '../../../db');

/** Apply bootstrap SQL and new, checksum-verified migrations in one transaction. */
export async function initializeDatabase(pool: Pool, options: { seedDemo?: boolean } = {}) {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('BEGIN');
    // Serialize setup commands so two application instances cannot race the migration ledger.
    await client.query('SELECT pg_advisory_xact_lock($1)', [1845221347]);
    await client.query(await readFile(resolve(databaseDirectory, 'schema.sql'), 'utf8'));
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const previous = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const checksums = new Map(previous.rows.map((row) => [row.version, row.checksum]));
    const directory = resolve(databaseDirectory, 'migrations');
    const files = (await readdir(directory))
      .filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
      .sort();
    for (const version of files) {
      const sql = await readFile(resolve(directory, version), 'utf8');
      // Normalize checkout line endings so the same migration has the same digest on Windows and Linux.
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
      const existing = checksums.get(version);
      if (existing && existing !== checksum) {
        throw new Error(
          `Migration ${version} changed after it was applied. Add a new migration instead.`,
        );
      }
      if (existing) continue;
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        version,
        checksum,
      ]);
      applied.push(version);
    }
    if (options.seedDemo) {
      await client.query(await readFile(resolve(databaseDirectory, 'seed.sql'), 'utf8'));
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
