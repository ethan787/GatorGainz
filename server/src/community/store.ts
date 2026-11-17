import { randomBytes, randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  BlockedUser,
  ConnectionState,
  ConnectionsResponse,
  DailyActivity,
  InvitePreview,
  LeaderboardEntry,
  LeaderboardRange,
  LeaderboardResponse,
  LeaderboardScope,
  PersonCard,
  Profile,
  ProfileResponse,
  ProfileStats,
  UpdateProfileRequest,
  Workout,
} from '@gatorgainz/types';
import { addDays, badgesFor, lastSevenDays, streaks } from './stats';
import { baseHandle, levelFor } from './validation';

/** Same response for "missing", "private", and "blocked", so accounts cannot be probed. */
export class PersonNotFoundError extends Error {
  constructor() {
    super('No one matches that username or invite.');
    this.name = 'PersonNotFoundError';
  }
}
export class HandleTakenError extends Error {
  constructor() {
    super('That username is taken. Try another.');
    this.name = 'HandleTakenError';
  }
}
export class ConnectionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionLimitError';
  }
}
export class SelfConnectionError extends Error {
  constructor() {
    super('You cannot connect with yourself.');
    this.name = 'SelfConnectionError';
  }
}

export const MAX_PENDING_OUTGOING = 50;
export const MAX_REQUESTS_PER_DAY = 30;
export const LEADERBOARD_SIZE = 50;

export interface CommunityStore {
  ensureProfile(userId: string): Promise<void>;
  getProfile(userId: string, today: string): Promise<ProfileResponse>;
  updateProfile(
    userId: string,
    update: UpdateProfileRequest,
    today: string,
  ): Promise<ProfileResponse>;
  searchPeople(viewerId: string, query: string): Promise<PersonCard[]>;
  getConnections(viewerId: string): Promise<ConnectionsResponse>;
  requestConnection(
    viewerId: string,
    target: { handle: string } | { inviteCode: string },
  ): Promise<PersonCard>;
  acceptConnection(viewerId: string, otherId: string): Promise<PersonCard | null>;
  removeConnection(viewerId: string, otherId: string): Promise<boolean>;
  blockUser(viewerId: string, otherId: string): Promise<boolean>;
  unblockUser(viewerId: string, otherId: string): Promise<boolean>;
  getBlocks(viewerId: string): Promise<BlockedUser[]>;
  getLeaderboard(
    viewerId: string,
    scope: LeaderboardScope,
    range: LeaderboardRange,
    today: string,
  ): Promise<LeaderboardResponse>;
  getInviteCode(userId: string): Promise<string>;
  regenerateInviteCode(userId: string): Promise<string>;
  previewInvite(code: string): Promise<InvitePreview | null>;
}

const newInviteCode = () => randomBytes(9).toString('base64url'); // 12 characters

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

type Db = Pool | PoolClient;

// Neither account has blocked the other.
const notBlocked = (viewer: string, other: string) => `NOT EXISTS (
  SELECT 1 FROM user_blocks b
  WHERE (b.blocker_id = ${viewer} AND b.blocked_id = ${other})
     OR (b.blocker_id = ${other} AND b.blocked_id = ${viewer}))`;

const totalPoints = (user: string) => `COALESCE((
  SELECT SUM(a.points) FROM workouts w JOIN workout_awards a ON a.workout_id = w.id
  WHERE w.user_id = ${user}), 0)::integer`;

const connectionState = (viewer: string) => `CASE
  WHEN c.status = 'accepted' THEN 'connected'
  WHEN c.status = 'pending' AND c.requester_id = ${viewer} THEN 'outgoing'
  WHEN c.status = 'pending' THEN 'incoming'
  ELSE 'none' END`;

const joinConnection = (viewer: string) => `LEFT JOIN connections c
  ON (c.requester_id = ${viewer} AND c.addressee_id = u.id)
  OR (c.addressee_id = ${viewer} AND c.requester_id = u.id)`;

/** The only columns other users ever receive. */
const cardSelect = (viewer: string) => `SELECT u.id AS "userId", u.display_name AS "fullName",
  p.handle, ${totalPoints('u.id')} AS "totalPoints", ${connectionState(viewer)} AS connection
  FROM users u JOIN user_profiles p ON p.user_id = u.id ${joinConnection(viewer)}`;

type CardRow = Omit<PersonCard, 'level'>;
const toCard = (row: CardRow): PersonCard => ({ ...row, level: levelFor(row.totalPoints).level });

async function cardFor(db: Db, viewerId: string, userId: string): Promise<PersonCard> {
  const { rows } = await db.query<CardRow>(`${cardSelect('$1')} WHERE u.id = $2`, [
    viewerId,
    userId,
  ]);
  return toCard(rows[0]);
}

async function insertProfile(db: Db, userId: string): Promise<void> {
  const user = await db.query<{ name: string }>(
    'SELECT display_name AS name FROM users WHERE id = $1 AND password_hash IS NOT NULL',
    [userId],
  );
  if (user.rows.length === 0) throw new Error('Profiles are only created for registered accounts.');
  const base = baseHandle(user.rows[0].name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const handle = attempt === 0 ? base : `${base.slice(0, 18)}_${randomInt(1000, 100000)}`;
    const inserted = await db.query(
      `INSERT INTO user_profiles (user_id, handle, invite_code) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [userId, handle, newInviteCode()],
    );
    if (inserted.rowCount === 1) return;
    const exists = await db.query('SELECT 1 FROM user_profiles WHERE user_id = $1', [userId]);
    if (exists.rowCount === 1) return; // created concurrently
  }
  throw new Error('Could not pick a unique username.');
}

export function createPostgresCommunityStore(pool: Pool): CommunityStore {
  async function ensure(userId: string) {
    const existing = await pool.query('SELECT 1 FROM user_profiles WHERE user_id = $1', [userId]);
    if (existing.rowCount === 0) await insertProfile(pool, userId);
  }

  async function loadProfile(userId: string, today: string): Promise<ProfileResponse> {
    await ensure(userId);
    const weekStart = addDays(today, -6);
    const [profile, totals, awards, dates, daily, best, favorite, connections] = await Promise.all([
      pool.query<Profile>(
        `SELECT u.id AS "userId", u.display_name AS "fullName", u.email, p.handle, p.bio,
           p.primary_goal AS "primaryGoal", p.training_level AS "trainingLevel",
           p.preferred_units AS "preferredUnits", p.weekly_goal AS "weeklyGoal", p.visibility,
           u.created_at AS "joinedAt"
         FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
        [userId],
      ),
      pool.query<{ workouts: number; minutes: number }>(
        `SELECT COUNT(*)::integer AS workouts, COALESCE(SUM(duration_minutes), 0)::integer AS minutes
         FROM workouts WHERE user_id = $1`,
        [userId],
      ),
      pool.query<{ points: number; scored: number }>(
        `SELECT COALESCE(SUM(a.points), 0)::integer AS points, COUNT(*)::integer AS scored
         FROM workout_awards a JOIN workouts w ON w.id = a.workout_id WHERE w.user_id = $1`,
        [userId],
      ),
      pool.query<{ date: string }>(
        `SELECT DISTINCT to_char(completed_at, 'YYYY-MM-DD') AS date FROM workouts WHERE user_id = $1`,
        [userId],
      ),
      pool.query<DailyActivity & { minutes: number }>(
        `SELECT to_char(w.completed_at, 'YYYY-MM-DD') AS date, COUNT(*)::integer AS workouts,
           COALESCE(SUM(a.points), 0)::integer AS points,
           COALESCE(SUM(w.duration_minutes), 0)::integer AS minutes
         FROM workouts w LEFT JOIN workout_awards a ON a.workout_id = w.id
         WHERE w.user_id = $1 AND w.completed_at BETWEEN $2::date AND $3::date
         GROUP BY w.completed_at`,
        [userId, weekStart, today],
      ),
      pool.query<{ name: string; points: number; completedAt: string }>(
        `SELECT w.name, a.points, to_char(w.completed_at, 'YYYY-MM-DD') AS "completedAt"
         FROM workout_awards a JOIN workouts w ON w.id = a.workout_id
         WHERE w.user_id = $1 ORDER BY a.points DESC, w.completed_at DESC LIMIT 1`,
        [userId],
      ),
      pool.query<{ category: Workout['category'] }>(
        `SELECT category FROM workouts WHERE user_id = $1
         GROUP BY category ORDER BY COUNT(*) DESC, category LIMIT 1`,
        [userId],
      ),
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::integer AS count FROM connections c JOIN users u
           ON u.id = CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END
         WHERE (c.requester_id = $1 OR c.addressee_id = $1) AND c.status = 'accepted'`,
        [userId],
      ),
    ]);
    const me = profile.rows[0];
    const total = awards.rows[0].points;
    const rank =
      me.visibility === 'public'
        ? await pool.query<{ rank: number }>(
            `SELECT COUNT(*)::integer + 1 AS rank FROM users u JOIN user_profiles p ON p.user_id = u.id
             WHERE u.password_hash IS NOT NULL AND p.visibility = 'public' AND u.id <> $1
               AND ${totalPoints('u.id')} > $2`,
            [userId, total],
          )
        : null;
    const streak = streaks(
      dates.rows.map((row) => row.date),
      today,
    );
    const week = daily.rows.reduce(
      (sum, row) => ({
        workouts: sum.workouts + row.workouts,
        points: sum.points + row.points,
        minutes: sum.minutes + row.minutes,
      }),
      { workouts: 0, points: 0, minutes: 0 },
    );
    const stats: ProfileStats = {
      totalPoints: total,
      totalWorkouts: totals.rows[0].workouts,
      scoredWorkouts: awards.rows[0].scored,
      totalMinutes: totals.rows[0].minutes,
      currentStreakDays: streak.current,
      longestStreakDays: streak.longest,
      thisWeek: { ...week, goal: me.weeklyGoal },
      last7Days: lastSevenDays(
        daily.rows.map(({ date, workouts, points }) => ({ date, workouts, points })),
        today,
      ),
      bestWorkout: best.rows[0] ?? null,
      favoriteCategory: favorite.rows[0]?.category ?? null,
      level: levelFor(total),
      globalRank: rank ? rank.rows[0].rank : null,
    };
    const connectionCount = connections.rows[0].count;
    return {
      profile: { ...me, joinedAt: new Date(me.joinedAt).toISOString() },
      stats,
      badges: badgesFor(stats, connectionCount),
      connectionCount,
    };
  }

  async function lockPair(client: PoolClient, a: string, b: string) {
    // Serializes all changes for one pair of accounts, in either direction.
    const [low, high] = a < b ? [a, b] : [b, a];
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${low}:${high}`]);
  }

  return {
    ensureProfile: ensure,
    getProfile: loadProfile,

    async updateProfile(userId, update, today) {
      await ensure(userId);
      try {
        await inTransaction(pool, async (client) => {
          if (update.fullName !== undefined) {
            await client.query('UPDATE users SET display_name = $2 WHERE id = $1', [
              userId,
              update.fullName,
            ]);
          }
          const columns: Array<[string, unknown]> = [
            ['handle', update.handle],
            ['bio', update.bio],
            ['primary_goal', update.primaryGoal],
            ['training_level', update.trainingLevel],
            ['preferred_units', update.preferredUnits],
            ['weekly_goal', update.weeklyGoal],
            ['visibility', update.visibility],
          ];
          const set = columns.filter(([, value]) => value !== undefined);
          if (set.length > 0) {
            await client.query(
              `UPDATE user_profiles SET ${set.map(([column], i) => `${column} = $${i + 2}`).join(', ')},
                 updated_at = now() WHERE user_id = $1`,
              [userId, ...set.map(([, value]) => value)],
            );
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new HandleTakenError();
        throw error;
      }
      return loadProfile(userId, today);
    },

    async searchPeople(viewerId, query) {
      await ensure(viewerId);
      // ILIKE metacharacters in the query are escaped so it is matched literally.
      const pattern = `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      const { rows } = await pool.query<CardRow>(
        `${cardSelect('$1')}
         WHERE u.id <> $1 AND u.password_hash IS NOT NULL AND ${notBlocked('$1', 'u.id')}
           AND (p.visibility = 'public' OR c.status IS NOT NULL)
           AND (u.display_name ILIKE $2 OR p.handle ILIKE $2)
         ORDER BY (p.handle = lower($3)) DESC, u.display_name, p.handle LIMIT 20`,
        [viewerId, pattern, query],
      );
      return rows.map(toCard);
    },

    async getConnections(viewerId) {
      await ensure(viewerId);
      const { rows } = await pool.query<CardRow>(
        `${cardSelect('$1')}
         WHERE c.status IS NOT NULL AND u.id <> $1 AND ${notBlocked('$1', 'u.id')}
         ORDER BY u.display_name, p.handle`,
        [viewerId],
      );
      const cards = rows.map(toCard);
      const by = (state: ConnectionState) => cards.filter((card) => card.connection === state);
      return { connected: by('connected'), incoming: by('incoming'), outgoing: by('outgoing') };
    },

    async requestConnection(viewerId, target) {
      await ensure(viewerId);
      return inTransaction(pool, async (client) => {
        const viaInvite = 'inviteCode' in target;
        const found = await client.query<{ id: string; visibility: string }>(
          `SELECT u.id, p.visibility FROM users u JOIN user_profiles p ON p.user_id = u.id
           WHERE u.password_hash IS NOT NULL AND ${viaInvite ? 'p.invite_code = $1' : 'p.handle = $1'}`,
          [viaInvite ? target.inviteCode : target.handle],
        );
        const other = found.rows[0];
        if (!other) throw new PersonNotFoundError();
        if (other.id === viewerId) throw new SelfConnectionError();
        await lockPair(client, viewerId, other.id);

        const blocked = await client.query(
          `SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2)
             OR (blocker_id = $2 AND blocked_id = $1)`,
          [viewerId, other.id],
        );
        if (blocked.rowCount) throw new PersonNotFoundError();

        const existing = await client.query<{ requester: string; status: string }>(
          `SELECT requester_id AS requester, status FROM connections
           WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
          [viewerId, other.id],
        );
        const row = existing.rows[0];
        const accept = () =>
          client.query(
            `UPDATE connections SET status = 'accepted', accepted_at = now()
             WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
            [viewerId, other.id],
          );

        if (row?.status === 'accepted') return cardFor(client, viewerId, other.id);
        if (viaInvite) {
          // The inviter shared the link and the viewer chose to connect: both sides agreed.
          if (row) await accept();
          else {
            await client.query(
              `INSERT INTO connections (requester_id, addressee_id, status, accepted_at)
               VALUES ($2, $1, 'accepted', now())`,
              [viewerId, other.id],
            );
          }
          return cardFor(client, viewerId, other.id);
        }
        // By username: private accounts can only be reached through their invite link.
        if (!row && other.visibility !== 'public') throw new PersonNotFoundError();
        if (row && row.requester === other.id) {
          await accept(); // They already asked; asking back means yes.
          return cardFor(client, viewerId, other.id);
        }
        if (row) return cardFor(client, viewerId, other.id); // already requested

        const limits = await client.query<{ pending: number; today: number }>(
          `SELECT COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
             COUNT(*) FILTER (WHERE created_at > now() - interval '1 day')::integer AS today
           FROM connections WHERE requester_id = $1`,
          [viewerId],
        );
        if (limits.rows[0].pending >= MAX_PENDING_OUTGOING) {
          throw new ConnectionLimitError(
            `You have ${MAX_PENDING_OUTGOING} requests waiting. Cancel some before sending more.`,
          );
        }
        if (limits.rows[0].today >= MAX_REQUESTS_PER_DAY) {
          throw new ConnectionLimitError(
            'You have sent the daily limit of requests. Try tomorrow.',
          );
        }
        await client.query(
          `INSERT INTO connections (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
          [viewerId, other.id],
        );
        return cardFor(client, viewerId, other.id);
      });
    },

    async acceptConnection(viewerId, otherId) {
      const result = await pool.query(
        `UPDATE connections SET status = 'accepted', accepted_at = now()
         WHERE requester_id = $2 AND addressee_id = $1 AND status = 'pending'
           AND ${notBlocked('$1', '$2')}`,
        [viewerId, otherId],
      );
      return result.rowCount === 1 ? cardFor(pool, viewerId, otherId) : null;
    },

    async removeConnection(viewerId, otherId) {
      // Decline, cancel, and disconnect are the same operation. The other side is not notified.
      const result = await pool.query(
        `DELETE FROM connections
         WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
        [viewerId, otherId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async blockUser(viewerId, otherId) {
      if (viewerId === otherId) throw new SelfConnectionError();
      return inTransaction(pool, async (client) => {
        const exists = await client.query(
          'SELECT 1 FROM users WHERE id = $1 AND password_hash IS NOT NULL',
          [otherId],
        );
        if (exists.rowCount === 0) return false;
        await lockPair(client, viewerId, otherId);
        await client.query(
          `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [viewerId, otherId],
        );
        await client.query(
          `DELETE FROM connections
           WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
          [viewerId, otherId],
        );
        return true;
      });
    },

    async unblockUser(viewerId, otherId) {
      const result = await pool.query(
        'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [viewerId, otherId],
      );
      return result.rowCount === 1;
    },

    async getBlocks(viewerId) {
      const { rows } = await pool.query<BlockedUser>(
        `SELECT u.id AS "userId", u.display_name AS "fullName", p.handle
         FROM user_blocks b JOIN users u ON u.id = b.blocked_id
         JOIN user_profiles p ON p.user_id = u.id
         WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
        [viewerId],
      );
      return rows;
    },

    async getLeaderboard(viewerId, scope, range, today) {
      await ensure(viewerId);
      const since =
        range === 'week' ? addDays(today, -6) : range === 'month' ? addDays(today, -29) : null;
      const membership = scope === 'global' ? `p.visibility = 'public'` : `c.status = 'accepted'`;
      const { rows } = await pool.query<Omit<LeaderboardEntry, 'isYou'>>(
        `WITH members AS (
           SELECT u.id, u.display_name, p.handle, ${connectionState('$1')} AS connection
           FROM users u JOIN user_profiles p ON p.user_id = u.id ${joinConnection('$1')}
           WHERE u.password_hash IS NOT NULL
             AND (u.id = $1 OR (${membership} AND ${notBlocked('$1', 'u.id')}))
         ), scored AS (
           SELECT m.*, COALESCE((
             SELECT SUM(a.points) FROM workouts w JOIN workout_awards a ON a.workout_id = w.id
             WHERE w.user_id = m.id AND ($2::date IS NULL OR w.completed_at >= $2::date)
           ), 0)::integer AS points
           FROM members m
         )
         SELECT RANK() OVER (ORDER BY points DESC)::integer AS rank, id AS "userId",
           display_name AS "fullName", handle, points,
           CASE WHEN id = $1 THEN 'none' ELSE connection END AS connection
         FROM scored ORDER BY points DESC, handle`,
        [viewerId, since],
      );
      const entries = rows.map((row) => ({ ...row, isYou: row.userId === viewerId }));
      return {
        scope,
        range,
        since,
        entries: entries.slice(0, LEADERBOARD_SIZE),
        you: entries.find((entry) => entry.isYou)!,
        boardPoints: entries.reduce((sum, entry) => sum + entry.points, 0),
        members: entries.length,
      };
    },

    async getInviteCode(userId) {
      await ensure(userId);
      const { rows } = await pool.query<{ code: string }>(
        'SELECT invite_code AS code FROM user_profiles WHERE user_id = $1',
        [userId],
      );
      return rows[0].code;
    },

    async regenerateInviteCode(userId) {
      await ensure(userId);
      const code = newInviteCode();
      await pool.query(
        'UPDATE user_profiles SET invite_code = $2, updated_at = now() WHERE user_id = $1',
        [userId, code],
      );
      return code;
    },

    async previewInvite(code) {
      const { rows } = await pool.query<InvitePreview>(
        `SELECT u.display_name AS "fullName", p.handle FROM user_profiles p
         JOIN users u ON u.id = p.user_id WHERE p.invite_code = $1 AND u.password_hash IS NOT NULL`,
        [code],
      );
      return rows[0] ?? null;
    },
  };
}
