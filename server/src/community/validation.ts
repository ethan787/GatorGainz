import type {
  LeaderboardRange,
  LeaderboardScope,
  PrimaryGoal,
  PreferredUnits,
  ProfileVisibility,
  TrainingLevel,
  UpdateProfileRequest,
} from '@gatorgainz/types';
import { isCalendarDate } from '../me/history-query';

type Result<T> = T | { error: string };

export const PRIMARY_GOALS: readonly PrimaryGoal[] = [
  'build_strength',
  'lose_weight',
  'improve_endurance',
  'stay_active',
  'improve_mobility',
];
export const TRAINING_LEVELS: readonly TrainingLevel[] = ['beginner', 'intermediate', 'advanced'];
export const UNITS: readonly PreferredUnits[] = ['imperial', 'metric'];
export const VISIBILITIES: readonly ProfileVisibility[] = ['public', 'private'];
export const LEADERBOARD_SCOPES: readonly LeaderboardScope[] = ['global', 'connections'];
export const LEADERBOARD_RANGES: readonly LeaderboardRange[] = ['week', 'month', 'all'];

export const HANDLE = /^[a-z0-9_]{3,24}$/;
export const INVITE_CODE = /^[A-Za-z0-9_-]{12,16}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Handles that could be mistaken for staff or the app itself.
const RESERVED_HANDLES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'staff',
  'moderator',
  'gatorgainz',
  'official',
  'system',
  'root',
  'null',
  'undefined',
  'me',
  'you',
]);

/** Lowercases and validates a handle. A leading "@" is accepted and removed. */
export function normalizeHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  return HANDLE.test(handle) ? handle : null;
}

/** Builds a starting handle from a display name, e.g. "Luke Easterling" → "luke_easterling". */
export function baseHandle(fullName: string): string {
  const base = fullName
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18);
  return base.length >= 3 && !RESERVED_HANDLES.has(base) ? base : 'athlete';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** Validates PATCH /api/me/profile. Unknown fields are rejected so typos are not silently lost. */
export function validateProfileUpdate(body: unknown): Result<{ update: UpdateProfileRequest }> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Send the profile fields as a JSON object.' };
  }
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'fullName',
    'handle',
    'bio',
    'primaryGoal',
    'trainingLevel',
    'preferredUnits',
    'weeklyGoal',
    'visibility',
    'onboarded',
  ]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0)
    return { error: `These fields cannot be changed here: ${unknown.join(', ')}.` };
  if (Object.keys(input).length === 0) return { error: 'Send at least one field to change.' };

  const update: UpdateProfileRequest = {};
  if ('fullName' in input) {
    const name =
      typeof input.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : '';
    // eslint-disable-next-line no-control-regex
    if (name.length < 1 || Array.from(name).length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      return { error: 'Name must be 1–80 characters.' };
    }
    update.fullName = name;
  }
  if ('handle' in input) {
    const handle = normalizeHandle(input.handle);
    if (!handle) {
      return { error: 'Username must be 3–24 lowercase letters, numbers, or underscores.' };
    }
    if (RESERVED_HANDLES.has(handle)) return { error: 'That username is reserved. Try another.' };
    update.handle = handle;
  }
  if ('bio' in input) {
    if (typeof input.bio !== 'string') return { error: 'Bio must be text.' };
    const bio = input.bio.trim();
    if (bio.length > 160) return { error: 'Bio must be 160 characters or fewer.' };
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(bio))
      return { error: 'Bio contains invalid characters.' };
    update.bio = bio;
  }
  if ('primaryGoal' in input) {
    if (!oneOf(input.primaryGoal, PRIMARY_GOALS)) return { error: 'Choose a listed primary goal.' };
    update.primaryGoal = input.primaryGoal;
  }
  if ('trainingLevel' in input) {
    if (!oneOf(input.trainingLevel, TRAINING_LEVELS))
      return { error: 'Choose a listed training level.' };
    update.trainingLevel = input.trainingLevel;
  }
  if ('preferredUnits' in input) {
    if (!oneOf(input.preferredUnits, UNITS)) return { error: 'Units must be imperial or metric.' };
    update.preferredUnits = input.preferredUnits;
  }
  if ('weeklyGoal' in input) {
    const goal = input.weeklyGoal;
    if (typeof goal !== 'number' || !Number.isInteger(goal) || goal < 1 || goal > 14) {
      return { error: 'Weekly goal must be a whole number from 1 to 14.' };
    }
    update.weeklyGoal = goal;
  }
  if ('onboarded' in input) {
    if (input.onboarded !== true) return { error: 'onboarded can only be set to true.' };
    update.onboarded = true;
  }
  if ('visibility' in input) {
    if (!oneOf(input.visibility, VISIBILITIES))
      return { error: 'Visibility must be public or private.' };
    update.visibility = input.visibility;
  }
  return { update };
}

/** Search text: 2–40 characters. Matched as plain text, never as a pattern. */
export function parseSearch(value: unknown): Result<{ query: string }> {
  const query = typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
  if (query.length < 2 || query.length > 40) {
    return { error: 'Search with 2–40 characters of a name or username.' };
  }
  return { query };
}

export function parseLeaderboard(raw: Record<string, unknown>): Result<{
  scope: LeaderboardScope;
  range: LeaderboardRange;
}> {
  const scope = raw.scope ?? 'global';
  const range = raw.range ?? 'week';
  if (!oneOf(scope, LEADERBOARD_SCOPES)) return { error: 'scope must be global or connections.' };
  if (!oneOf(range, LEADERBOARD_RANGES)) return { error: 'range must be week, month, or all.' };
  return { scope, range };
}

/**
 * The client's local date, so streaks and "this week" follow the user's calendar. It must be
 * within one day of the server's UTC date; otherwise the server date is used.
 */
export function resolveToday(value: unknown, now = new Date()): string {
  const server = now.toISOString().slice(0, 10);
  if (typeof value !== 'string' || !isCalendarDate(value)) return server;
  const diff = Math.abs(Date.parse(`${value}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`));
  return diff <= 86_400_000 ? value : server;
}

export const POINTS_PER_LEVEL = 500;
export function levelFor(points: number) {
  return {
    level: Math.floor(points / POINTS_PER_LEVEL) + 1,
    pointsIntoLevel: points % POINTS_PER_LEVEL,
    pointsPerLevel: POINTS_PER_LEVEL,
  };
}
