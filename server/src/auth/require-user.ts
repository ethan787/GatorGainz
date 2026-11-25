import type { RequestHandler } from 'express';
import type { AuthStore } from './store';
import { presentedTokenHash } from './routes';

/**
 * Resolves the signed-in user from the session cookie into response.locals.user.
 * Missing, malformed, expired, or revoked sessions get 401. Ownership always comes from here.
 */
export function createRequireUser(authStore: AuthStore): RequestHandler {
  return async (request, response, next) => {
    const tokenHash = presentedTokenHash(request);
    const user = tokenHash ? await authStore.findSessionUser(tokenHash) : null;
    if (!user) {
      response.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }
    response.locals.user = user;
    next();
  };
}
