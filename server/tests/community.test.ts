import { addDays, badgesFor, lastSevenDays, streaks } from '../src/community/stats';
import {
  baseHandle,
  levelFor,
  normalizeHandle,
  parseLeaderboard,
  parseSearch,
  resolveToday,
  validateProfileUpdate,
} from '../src/community/validation';
import type { ProfileStats } from '@gatorgainz/types';

describe('streaks', () => {
  const today = '2026-11-16';
  it('counts back from today, or from yesterday before today is logged', () => {
    expect(streaks(['2026-11-14', '2026-11-15', '2026-11-16'], today)).toEqual({
      current: 3,
      longest: 3,
    });
    expect(streaks(['2026-11-14', '2026-11-15'], today)).toEqual({ current: 2, longest: 2 });
    expect(streaks(['2026-11-13', '2026-11-14'], today)).toEqual({ current: 0, longest: 2 });
  });
  it('ignores duplicates and future dates and finds the longest run', () => {
    expect(
      streaks(
        ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-03', '2026-11-10', '2026-11-17'],
        today,
      ),
    ).toEqual({ current: 0, longest: 3 });
    expect(streaks([], today)).toEqual({ current: 0, longest: 0 });
  });
  it('crosses month and year boundaries', () => {
    expect(streaks(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01').current).toBe(3);
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('last seven days', () => {
  it('fills missing days with zeros, oldest first', () => {
    const days = lastSevenDays([{ date: '2026-11-14', workouts: 2, points: 50 }], '2026-11-16');
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(days[4]).toEqual({ date: '2026-11-14', workouts: 2, points: 50 });
    expect(days[6]).toEqual({ date: '2026-11-16', workouts: 0, points: 0 });
  });
});

describe('levels and badges', () => {
  it('uses 500 points per level', () => {
    expect(levelFor(0)).toEqual({ level: 1, pointsIntoLevel: 0, pointsPerLevel: 500 });
    expect(levelFor(1234)).toEqual({ level: 3, pointsIntoLevel: 234, pointsPerLevel: 500 });
  });
  it('earns badges only from real stats', () => {
    const stats = {
      totalPoints: 1200,
      totalWorkouts: 10,
      longestStreakDays: 7,
      thisWeek: { workouts: 2, points: 0, minutes: 0, goal: 3 },
      globalRank: null,
    } as unknown as ProfileStats;
    const earned = badgesFor(stats, 0)
      .filter((b) => b.earned)
      .map((b) => b.id);
    expect(earned).toEqual(['first-workout', 'ten-workouts', 'streak-7', 'points-1000']);
  });
});

describe('usernames', () => {
  it('builds a starting username from the name', () => {
    expect(baseHandle('Luke Easterling')).toBe('luke_easterling');
    expect(baseHandle('José  Núñez-Ruiz')).toBe('jose_nunezruiz');
    expect(baseHandle('Al')).toBe('athlete');
    expect(baseHandle('Admin')).toBe('athlete');
  });
  it('normalizes typed usernames', () => {
    expect(normalizeHandle('@Maya_Chen')).toBe('maya_chen');
    expect(normalizeHandle('ma')).toBeNull();
    expect(normalizeHandle('maya chen')).toBeNull();
    expect(normalizeHandle(5)).toBeNull();
  });
});

describe('request validation', () => {
  it('accepts a valid profile update and trims text', () => {
    expect(validateProfileUpdate({ fullName: ' Luke  E ', bio: ' hi ', weeklyGoal: 4 })).toEqual({
      update: { fullName: 'Luke E', bio: 'hi', weeklyGoal: 4 },
    });
  });
  it.each([
    [null],
    [[]],
    [{}],
    [{ email: 'a@b.c' }],
    [{ fullName: '\u0007bell' }],
    [{ fullName: 'x'.repeat(81) }],
    [{ handle: 'support' }],
    [{ bio: 5 }],
    [{ bio: 'line\u0000' }],
    [{ primaryGoal: 'get_huge' }],
    [{ trainingLevel: 'pro' }],
    [{ preferredUnits: 'stone' }],
    [{ weeklyGoal: 15 }],
    [{ visibility: 'friends' }],
  ])('rejects %j', (body) => {
    expect(validateProfileUpdate(body)).toHaveProperty('error');
  });
  it('validates search text and leaderboard options', () => {
    expect(parseSearch(' @ma ')).toEqual({ query: 'ma' });
    expect(parseSearch('m')).toHaveProperty('error');
    expect(parseSearch(['ma', 'mb'])).toHaveProperty('error');
    expect(parseLeaderboard({})).toEqual({ scope: 'global', range: 'week' });
    expect(parseLeaderboard({ scope: 'connections', range: 'all' })).toEqual({
      scope: 'connections',
      range: 'all',
    });
    expect(parseLeaderboard({ range: ['week'] })).toHaveProperty('error');
  });
  it("uses the client's date only within a day of the server's", () => {
    const now = new Date('2026-11-16T03:00:00Z');
    expect(resolveToday('2026-11-15', now)).toBe('2026-11-15');
    expect(resolveToday('2026-11-17', now)).toBe('2026-11-17');
    expect(resolveToday('2026-11-01', now)).toBe('2026-11-16');
    expect(resolveToday('nope', now)).toBe('2026-11-16');
  });
});
