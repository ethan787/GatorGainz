import { createHash, randomBytes } from 'node:crypto';
import { Router, type CookieOptions, type Request, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthResponse } from '@gatorgainz/types';
import { hashPassword, isValidNewPassword, PASSWORD_MAX_BYTES, verifyPassword } from './passwords';
import { EmailAlreadyRegisteredError, type AuthStore, type NewSession } from './store';

export interface AuthOptions {
  authStore?: AuthStore;
  secureCookies?: boolean;
  authOrigin?: string;
  authRateLimits?: { loginMax?: number; registerMax?: number };
}

export const SESSION_COOKIE_NAME = 'gatorgainz_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Fixed cost-12 hash keeps unknown accounts and demo profiles on the bcrypt comparison path.
const dummyPasswordHash = '$2b$12$19kejKyh3HP4YfEhVkCJceT9V3JSKdomGIL23q7JksUtHcapVH02i';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionToken(request: Request): string | undefined {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (values.length !== 1) return undefined;
  const value = values[0].slice(SESSION_COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

function presentedTokenHash(request: Request): string | undefined {
  const token = sessionToken(request);
  return token ? hashSessionToken(token) : undefined;
}

function newSession(): { token: string; record: NewSession } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    record: {
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  };
}

function objectBody(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 &&
    !/[\u0000-\u001f\u007f]/.test(email) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('AUTH_ORIGIN must be an HTTP(S) origin without a path, credentials, or query.');
  }
  return url.origin;
}

const requireJson: RequestHandler = (request, response, next) => {
  if (!request.is('application/json')) {
    response.status(415).json({ error: 'Use Content-Type: application/json.' });
    return;
  }
  next();
};

export function createAuthRouter(options: AuthOptions = {}) {
  const router = Router();
  const allowedOrigin = options.authOrigin ? canonicalOrigin(options.authOrigin) : undefined;
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secureCookies ?? process.env.NODE_ENV === 'production',
    path: '/',
  };

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use((request, response, next) => {
    if (request.method === 'POST') {
      if (request.get('X-GatorGainz-Request') !== '1') {
        response.status(403).json({ error: 'Request verification failed.' });
        return;
      }
      const origin = request.get('Origin');
      if (origin) {
        try {
          const expected =
            allowedOrigin ?? canonicalOrigin(`${request.protocol}://${request.get('host')}`);
          if (canonicalOrigin(origin) !== expected) throw new Error('Origin mismatch');
        } catch {
          response.status(403).json({ error: 'Request verification failed.' });
          return;
        }
      }
    }
    next();
  });

  const store = options.authStore;
  if (!store) {
    router.use((_request, response) => {
      response
        .status(503)
        .json({ error: 'Account service is unavailable. Configure PostgreSQL first.' });
    });
    return router;
  }

  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: options.authRateLimits?.registerMax ?? 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many registration attempts. Try again later.' },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.authRateLimits?.loginMax ?? 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  });

  router.post('/register', requireJson, registerLimiter, async (request, response) => {
    const body = objectBody(request.body);
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const email = normalizedEmail(body?.email);
    const password = body?.password;
    if (
      !fullName ||
      Array.from(fullName).length > 80 ||
      /[\u0000-\u001f\u007f]/.test(fullName) ||
      !email ||
      typeof password !== 'string' ||
      !isValidNewPassword(password)
    ) {
      response.status(400).json({
        error:
          'Enter a name of 1–80 characters, a valid email, and a password of at least 15 characters and at most 72 UTF-8 bytes.',
      });
      return;
    }
    const passwordHash = await hashPassword(password);
    const session = newSession();
    try {
      const user = await store.registerWithSession(
        { fullName, email, passwordHash },
        session.record,
        presentedTokenHash(request),
      );
      response.cookie(SESSION_COOKIE_NAME, session.token, {
        ...cookieOptions,
        expires: session.record.expiresAt,
        maxAge: SESSION_TTL_MS,
      });
      response.status(201).json({ user } satisfies AuthResponse);
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        response.status(409).json({ error: 'An account with that email already exists.' });
        return;
      }
      throw error;
    }
  });

  router.post('/login', requireJson, loginLimiter, async (request, response) => {
    const body = objectBody(request.body);
    const email = normalizedEmail(body?.email);
    const password = body?.password;
    if (!email || typeof password !== 'string') {
      response.status(400).json({ error: 'Enter a valid email and password.' });
      return;
    }
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      response.status(401).json({ error: 'Email or password is incorrect.' });
      return;
    }
    const account = await store.findUserByEmail(email);
    const matches = await verifyPassword(password, account?.passwordHash ?? dummyPasswordHash);
    if (!account?.passwordHash || !matches) {
      response.status(401).json({ error: 'Email or password is incorrect.' });
      return;
    }
    const session = newSession();
    await store.createSession(account.id, session.record, presentedTokenHash(request));
    response.cookie(SESSION_COOKIE_NAME, session.token, {
      ...cookieOptions,
      expires: session.record.expiresAt,
      maxAge: SESSION_TTL_MS,
    });
    const { passwordHash: _passwordHash, ...user } = account;
    response.json({ user } satisfies AuthResponse);
  });

  router.get('/me', async (request, response) => {
    const tokenHash = presentedTokenHash(request);
    const user = tokenHash ? await store.findSessionUser(tokenHash) : null;
    if (!user) {
      response.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      response.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }
    response.json({ user } satisfies AuthResponse);
  });

  router.post('/logout', async (request, response) => {
    const tokenHash = presentedTokenHash(request);
    if (tokenHash) await store.revokeSession(tokenHash);
    response.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    response.status(204).end();
  });

  return router;
}
