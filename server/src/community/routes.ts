import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type {
  AuthUser,
  ConnectionResponse,
  ConnectionsResponse,
  InvitePreview,
  InviteResponse,
  LeaderboardResponse,
  PeopleSearchResponse,
  ProfileResponse,
} from '@gatorgainz/types';
import type { AuthStore } from '../auth/store';
import { createRequestVerifier, requireJson } from '../auth/routes';
import { createRequireUser } from '../auth/require-user';
import {
  ConnectionLimitError,
  HandleTakenError,
  PersonNotFoundError,
  SelfConnectionError,
  type CommunityStore,
} from './store';
import {
  INVITE_CODE,
  normalizeHandle,
  parseLeaderboard,
  parseSearch,
  resolveToday,
  UUID,
  validateProfileUpdate,
} from './validation';

const owner = (response: Response) => (response.locals.user as AuthUser).id;

/** Maps community errors to safe HTTP answers. Anything else goes to the 500 handler. */
function sendKnownError(error: unknown, response: Response): boolean {
  if (error instanceof PersonNotFoundError) response.status(404).json({ error: error.message });
  else if (error instanceof SelfConnectionError)
    response.status(400).json({ error: error.message });
  else if (error instanceof HandleTakenError) response.status(409).json({ error: error.message });
  else if (error instanceof ConnectionLimitError)
    response.status(429).json({ error: error.message });
  else return false;
  return true;
}

/** Signed-in routes mounted inside /api/me (after the session check). */
export function createMeCommunityRouter(community: CommunityStore) {
  const router = Router();

  router.get('/profile', async (request, response) => {
    const today = resolveToday(request.query.today);
    response.json((await community.getProfile(owner(response), today)) satisfies ProfileResponse);
  });

  router.patch('/profile', requireJson, async (request, response) => {
    const parsed = validateProfileUpdate(request.body);
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const today = resolveToday(request.query.today);
      const result = await community.updateProfile(owner(response), parsed.update, today);
      response.json(result satisfies ProfileResponse);
    } catch (error) {
      if (!sendKnownError(error, response)) throw error;
    }
  });

  router.get('/connections', async (_request, response) => {
    response.json((await community.getConnections(owner(response))) satisfies ConnectionsResponse);
  });

  router.post('/connections', requireJson, async (request, response) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const handle = body.handle === undefined ? undefined : normalizeHandle(body.handle);
    const inviteCode =
      typeof body.inviteCode === 'string' && INVITE_CODE.test(body.inviteCode)
        ? body.inviteCode
        : undefined;
    if ((handle ? 1 : 0) + (inviteCode ? 1 : 0) !== 1 || handle === null) {
      response.status(400).json({ error: 'Send one valid username or invite code.' });
      return;
    }
    try {
      const person = await community.requestConnection(
        owner(response),
        handle ? { handle } : { inviteCode: inviteCode! },
      );
      response.status(201).json({ person } satisfies ConnectionResponse);
    } catch (error) {
      if (!sendKnownError(error, response)) throw error;
    }
  });

  router.post('/connections/:userId/accept', async (request, response) => {
    const otherId = String(request.params.userId);
    const person = UUID.test(otherId)
      ? await community.acceptConnection(owner(response), otherId)
      : null;
    if (!person) {
      response.status(404).json({ error: 'That request is no longer waiting.' });
      return;
    }
    response.json({ person } satisfies ConnectionResponse);
  });

  router.delete('/connections/:userId', async (request, response) => {
    const otherId = String(request.params.userId);
    const removed =
      UUID.test(otherId) && (await community.removeConnection(owner(response), otherId));
    if (!removed) {
      response.status(404).json({ error: 'No connection or request with that person.' });
      return;
    }
    response.status(204).end();
  });

  router.get('/blocks', async (_request, response) => {
    response.json({ blocked: await community.getBlocks(owner(response)) });
  });

  router.post('/blocks', requireJson, async (request, response) => {
    const otherId = (request.body as Record<string, unknown> | undefined)?.userId;
    try {
      const blocked =
        typeof otherId === 'string' &&
        UUID.test(otherId) &&
        (await community.blockUser(owner(response), otherId));
      if (!blocked) {
        response.status(404).json({ error: 'No one matches that account.' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      if (!sendKnownError(error, response)) throw error;
    }
  });

  router.delete('/blocks/:userId', async (request, response) => {
    const otherId = String(request.params.userId);
    const removed = UUID.test(otherId) && (await community.unblockUser(owner(response), otherId));
    if (!removed) {
      response.status(404).json({ error: 'That account is not blocked.' });
      return;
    }
    response.status(204).end();
  });

  router.get('/invite', async (_request, response) => {
    const inviteCode = await community.getInviteCode(owner(response));
    response.json({ inviteCode } satisfies InviteResponse);
  });

  // A new code invalidates every link shared before.
  router.post('/invite', async (_request, response) => {
    const inviteCode = await community.regenerateInviteCode(owner(response));
    response.json({ inviteCode } satisfies InviteResponse);
  });

  return router;
}

export interface CommunityRouteOptions {
  community?: CommunityStore;
  authStore?: AuthStore;
  authOrigin?: string;
  invitePreviewMax?: number;
}

function baseRouter(options: CommunityRouteOptions) {
  const router = Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(createRequestVerifier(options.authOrigin));
  const { community, authStore } = options;
  if (!community || !authStore) {
    router.use((_request, response) => {
      response.status(503).json({ error: 'Community needs PostgreSQL. Configure it first.' });
    });
    return { router, community: undefined, authStore: undefined };
  }
  return { router, community, authStore };
}

/** /api/invites/:code — public preview of an invite link, before the visitor signs up. */
export function createInviteRouter(options: CommunityRouteOptions) {
  const { router, community } = baseRouter(options);
  if (!community) return router;
  const previewLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.invitePreviewMax ?? 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many invite lookups. Try again later.' },
  });
  // Only the inviter's name and username are revealed.
  router.get('/:code', previewLimiter, async (request, response) => {
    const code = String(request.params.code);
    const preview = INVITE_CODE.test(code) ? await community.previewInvite(code) : null;
    if (!preview) {
      response.status(404).json({ error: 'This invite link is not valid anymore.' });
      return;
    }
    response.json(preview satisfies InvitePreview);
  });
  return router;
}

/** /api/community — people search and leaderboards for signed-in users. */
export function createCommunityRouter(options: CommunityRouteOptions) {
  const { router, community, authStore } = baseRouter(options);
  if (!community || !authStore) return router;
  const signedIn = router;
  signedIn.use(createRequireUser(authStore));
  signedIn.get('/people', async (request, response) => {
    const parsed = parseSearch(request.query.q);
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const people = await community.searchPeople(owner(response), parsed.query);
    response.json({ people } satisfies PeopleSearchResponse);
  });
  signedIn.get('/people/:userId', async (request, response) => {
    const userId = String(request.params.userId);
    const person = UUID.test(userId) ? await community.getPerson(owner(response), userId) : null;
    if (!person) {
      // Same answer for missing, private, and blocked accounts.
      response.status(404).json({ error: 'This profile is not available.' });
      return;
    }
    response.json({ person } satisfies ConnectionResponse);
  });
  signedIn.get('/leaderboard', async (request, response) => {
    const parsed = parseLeaderboard(request.query as Record<string, unknown>);
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const board = await community.getLeaderboard(
      owner(response),
      parsed.scope,
      parsed.range,
      resolveToday(request.query.today),
    );
    response.json(board satisfies LeaderboardResponse);
  });
  return router;
}
