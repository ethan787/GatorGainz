import type { AuthUser } from '@gatorgainz/types';
import type { Pool, PoolClient } from 'pg';

export interface StoredAuthUser extends AuthUser {
  passwordHash: string | null;
}

export interface NewAccount {
  fullName: string;
  email: string;
  passwordHash: string;
}

export interface NewSession {
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthStore {
  registerWithSession(
    account: NewAccount,
    session: NewSession,
    previousTokenHash?: string,
  ): Promise<AuthUser>;
  findUserByEmail(email: string): Promise<StoredAuthUser | null>;
  createSession(userId: string, session: NewSession, previousTokenHash?: string): Promise<void>;
  findSessionUser(tokenHash: string): Promise<AuthUser | null>;
  revokeSession(tokenHash: string): Promise<void>;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with that email already exists.');
    this.name = 'EmailAlreadyRegisteredError';
  }
}

interface UserRow {
  id: string;
  fullName: string;
  email: string;
  joinedAt: Date;
  passwordHash?: string | null;
}

function publicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    joinedAt: row.joinedAt.toISOString(),
  };
}

const userColumns = `id, display_name AS "fullName", email, created_at AS "joinedAt"`;

async function insertSession(
  client: PoolClient,
  userId: string,
  session: NewSession,
  previousTokenHash?: string,
) {
  if (previousTokenHash) {
    await client.query('DELETE FROM auth_sessions WHERE token_hash = $1', [previousTokenHash]);
  }
  // Remove this account's expired sessions while issuing a new one.
  await client.query('DELETE FROM auth_sessions WHERE user_id = $1 AND expires_at <= now()', [
    userId,
  ]);
  await client.query(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [session.tokenHash, userId, session.expiresAt],
  );
}

export function createPostgresAuthStore(pool: Pool): AuthStore {
  return {
    async registerWithSession(account, session, previousTokenHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<UserRow>(
          `INSERT INTO users (display_name, email, password_hash) VALUES ($1, $2, $3)
           RETURNING ${userColumns}`,
          [account.fullName, account.email, account.passwordHash],
        );
        const user = publicUser(rows[0]);
        await insertSession(client, user.id, session, previousTokenHash);
        await client.query('COMMIT');
        return user;
      } catch (error) {
        await client.query('ROLLBACK');
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505' &&
          'constraint' in error &&
          (error.constraint === 'users_email_key' || error.constraint === 'users_email_lower_idx')
        ) {
          throw new EmailAlreadyRegisteredError();
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async findUserByEmail(email) {
      const { rows } = await pool.query<UserRow>(
        `SELECT ${userColumns}, password_hash AS "passwordHash" FROM users WHERE lower(email) = $1`,
        [email],
      );
      const row = rows[0];
      return row ? { ...publicUser(row), passwordHash: row.passwordHash ?? null } : null;
    },
    async createSession(userId, session, previousTokenHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await insertSession(client, userId, session, previousTokenHash);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async findSessionUser(tokenHash) {
      const { rows } = await pool.query<UserRow>(
        `SELECT u.id, u.display_name AS "fullName", u.email, u.created_at AS "joinedAt"
         FROM users u JOIN auth_sessions s ON s.user_id = u.id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [tokenHash],
      );
      return rows[0] ? publicUser(rows[0]) : null;
    },
    async revokeSession(tokenHash) {
      await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
    },
  };
}
