import type { Badge, DailyActivity, ProfileStats } from '@gatorgainz/types';

const DAY_MS = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date: string, days: number) =>
  new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Streaks over distinct workout dates. The current streak counts back from today, or from
 * yesterday if nothing is logged yet today, so a streak is not lost before the day ends.
 */
export function streaks(dates: readonly string[], today: string) {
  const days = [...new Set(dates)].filter((d) => d <= today).sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && toMs(days[i]) - toMs(days[i - 1]) === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/** Seven entries, oldest first, ending today; missing days are zeros. */
export function lastSevenDays(rows: readonly DailyActivity[], today: string): DailyActivity[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return byDate.get(date) ?? { date, workouts: 0, points: 0 };
  });
}

/** Milestones computed from real stats; nothing is awarded by the client. */
export function badgesFor(stats: ProfileStats, connectionCount: number): Badge[] {
  const badge = (id: string, title: string, detail: string, earned: boolean): Badge => ({
    id,
    title,
    detail,
    earned,
  });
  return [
    badge('first-workout', 'First rep', 'Log your first workout', stats.totalWorkouts >= 1),
    badge('ten-workouts', 'Regular', 'Log 10 workouts', stats.totalWorkouts >= 10),
    badge('streak-7', 'On fire', 'Train 7 days in a row', stats.longestStreakDays >= 7),
    badge(
      'weekly-goal',
      'Goal getter',
      `Hit your weekly goal of ${stats.thisWeek.goal}`,
      stats.thisWeek.workouts >= stats.thisWeek.goal,
    ),
    badge('points-1000', 'Four digits', 'Earn 1,000 points', stats.totalPoints >= 1000),
    badge('points-5000', 'Powerhouse', 'Earn 5,000 points', stats.totalPoints >= 5000),
    badge(
      'first-connection',
      'Training partner',
      'Make your first connection',
      connectionCount >= 1,
    ),
    badge(
      'top-ten',
      'Top ten',
      'Reach the global top 10',
      stats.globalRank !== null && stats.globalRank <= 10 && stats.totalPoints > 0,
    ),
  ];
}
