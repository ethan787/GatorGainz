import {
  calculateWorkoutPoints,
  normalizeExercises,
  WorkoutScoringError,
} from '../src/scoring/score';
import { buildSubmission, buildUpdate } from '../src/scoring/service';
import { EXERCISE_CATALOG } from '../src/scoring/config';

const base = {
  name: 'Session',
  category: 'strength',
  durationMinutes: 45,
  completedAt: '2026-10-20',
  submissionKey: 'scoring-test-key',
};
const now = new Date('2026-11-01T12:00:00Z');

/** Approved v1 examples (SCRUM-74). Keep in sync with docs/workout-scoring.md. */
const approvedExamples = [
  {
    label: 'strength baseline',
    exercises: [{ name: 'Barbell bench press', sets: 4, reps: 8 }],
    points: 96,
    each: [96],
  },
  {
    label: 'cardio at baseline',
    exercises: [{ name: 'Outdoor run', minutes: 20, metricValue: 3 }],
    points: 22,
    each: [22],
  },
  {
    label: 'mixed session',
    exercises: [
      { name: 'Back squat', sets: 3, reps: 10 },
      { name: 'Outdoor run', minutes: 40, metricValue: 6 },
    ],
    points: 160,
    each: [105, 55],
  },
];

/** Extra formula fixtures beyond the approved set: rounding and above-baseline cardio. */
const formulaFixtures = [
  {
    label: 'rounds 1.25 down',
    exercises: [{ name: 'Wrist curls', sets: 1, reps: 1 }],
    points: 1,
    each: [1],
  },
  {
    label: 'rounds 7.5 up',
    exercises: [{ name: 'Bicep curls', sets: 1, reps: 5 }],
    points: 8,
    each: [8],
  },
  {
    label: 'cardio above baseline',
    exercises: [{ name: 'Rowing machine', minutes: 30, metricValue: 3000 }],
    points: 32,
    each: [32],
  },
];

describe('scoring service v1 (SCRUM-75)', () => {
  it.each(formulaFixtures)('matches the formula fixture: $label', ({ exercises, points, each }) => {
    const result = calculateWorkoutPoints(normalizeExercises(exercises), 'v1');
    expect(result.points).toBe(points);
    expect(result.exercises.map((e) => e.points)).toEqual(each);
  });

  it.each(approvedExamples)(
    'matches the approved example: $label',
    ({ exercises, points, each }) => {
      const result = calculateWorkoutPoints(normalizeExercises(exercises), 'v1');
      expect(result.points).toBe(points);
      expect(result.exercises.map((e) => e.points)).toEqual(each);
      expect(result.scoringVersion).toBe('v1');
    },
  );

  it('is deterministic for identical data and version', () => {
    const exercises = normalizeExercises(approvedExamples[2].exercises);
    const results = Array.from({ length: 20 }, () => calculateWorkoutPoints(exercises, 'v1'));
    for (const result of results) expect(result).toEqual(results[0]);
  });

  it('ignores client-supplied point totals and base points', () => {
    const result = buildSubmission(
      {
        ...base,
        points: 999999,
        exercises: [
          { name: 'Barbell bench press', sets: 4, reps: 8, points: 5000, basePoints: 5000 },
        ],
      },
      'v1',
      now,
    );
    expect('submission' in result && result.submission.award?.points).toBe(96);
  });

  it.each([
    ['unknown exercise', [{ name: 'Invented lift', sets: 3, reps: 8 }]],
    ['zero sets', [{ name: 'Deadlift', sets: 0, reps: 8 }]],
    ['fractional reps', [{ name: 'Deadlift', sets: 3, reps: 7.5 }]],
    ['missing reps', [{ name: 'Deadlift', sets: 3 }]],
    ['cardio metric below range', [{ name: 'Outdoor run', minutes: 20, metricValue: 0 }]],
    ['cardio metric as string', [{ name: 'Outdoor run', minutes: 20, metricValue: '3' }]],
    ['NaN minutes', [{ name: 'Cycling', minutes: Number.NaN, metricValue: 8 }]],
    ['empty list', []],
    ['too many', Array.from({ length: 51 }, () => ({ name: 'Dips', sets: 1, reps: 1 }))],
    ['not an array', { name: 'Dips', sets: 1, reps: 1 }],
  ])('invalid workouts cannot generate an award: %s', (_label, exercises) => {
    expect(() => normalizeExercises(exercises)).toThrow(WorkoutScoringError);
    expect('error' in buildSubmission({ ...base, exercises }, 'v1', now)).toBe(true);
  });

  it('rejects unsupported scoring versions', () => {
    const exercises = normalizeExercises(approvedExamples[0].exercises);
    expect(() => calculateWorkoutPoints(exercises, 'v2' as 'v1')).toThrow(WorkoutScoringError);
  });

  it('requires a valid submission key when exercises are scored', () => {
    const exercises = approvedExamples[0].exercises;
    const { submissionKey: _k, ...withoutKey } = base;
    expect('error' in buildSubmission({ ...withoutKey, exercises }, 'v1', now)).toBe(true);
    expect(
      'error' in buildSubmission({ ...base, submissionKey: 'short', exercises }, 'v1', now),
    ).toBe(true);
    expect(
      'error' in buildSubmission({ ...base, submissionKey: 'has space!', exercises }, 'v1', now),
    ).toBe(true);
  });

  it('gives the same fingerprint for the same normalized workout and a different one otherwise', () => {
    const a = buildSubmission(
      { ...base, name: ' Session ', exercises: approvedExamples[0].exercises },
      'v1',
      now,
    );
    const b = buildSubmission({ ...base, exercises: approvedExamples[0].exercises }, 'v1', now);
    const c = buildSubmission({ ...base, exercises: approvedExamples[1].exercises }, 'v1', now);
    if (!('submission' in a && 'submission' in b && 'submission' in c)) throw new Error('invalid');
    expect(a.submission.fingerprint).toBe(b.submission.fingerprint);
    expect(a.submission.fingerprint).not.toBe(c.submission.fingerprint);
  });

  it('edits keep the scoring version already on the award and drop the award without exercises', () => {
    const update = buildUpdate(
      { ...base, submissionKey: undefined, exercises: approvedExamples[0].exercises },
      now,
    );
    expect('error' in update).toBe(true); // submissionKey cannot be sent on edits
    const { submissionKey: _k, ...fields } = base;
    const edit = buildUpdate({ ...fields, exercises: approvedExamples[0].exercises }, now);
    if ('error' in edit) throw new Error(edit.error);
    expect(edit.rescore('v1')?.scoringVersion).toBe('v1');
    expect(edit.rescore(null)?.points).toBe(96);
    const cleared = buildUpdate(fields, now);
    if ('error' in cleared) throw new Error(cleared.error);
    expect(cleared.rescore('v1')).toBeNull();
  });

  it('every catalog cardio exercise has a positive baseline', () => {
    for (const exercise of EXERCISE_CATALOG) {
      if (exercise.tracking === 'cardio')
        expect(exercise.cardioMetric?.baseline).toBeGreaterThan(0);
    }
  });
});
