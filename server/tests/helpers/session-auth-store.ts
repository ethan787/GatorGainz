import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser } from '@gatorgainz/types';
import type { AuthStore } from '../../src/auth/store';
import { hashSessionToken, SESSION_COOKIE_NAME } from '../../src/auth/routes';

/** Minimal in-memory auth store: only session lookup matters for the private routes. */
export class SessionOnlyAuthStore implements AuthStore {
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
    return { user, cookie: `${SESSION_COOKIE_NAME}=${token}`, token };
  }

  revoke(token: string) {
    this.sessions.delete(hashSessionToken(token));
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
