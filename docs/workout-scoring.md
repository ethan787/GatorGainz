# Workout scoring and points (SCRUM-75)

Owner: Luke Easterling. Depends on SCRUM-74 (approved scoring configuration) and authenticated
workout persistence (SCRUM-14). Supplies SCRUM-79; verified further by SCRUM-80.

## Where the code is

| File                                    | Role                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `server/src/scoring/config.ts`          | Approved exercise catalog and scoring versions (`v1`)                           |
| `server/src/scoring/score.ts`           | Pure scoring: `normalizeExercises()` and `calculateWorkoutPoints(exs, version)` |
| `server/src/scoring/service.ts`         | Builds a validated, scored submission for create and edit; no HTTP              |
| `server/src/data/postgres-store.ts`     | Transactional writes, idempotency, totals                                       |
| `db/migrations/002_…sql`                | `workout_exercises`, `workout_awards`, submission key and history index         |
| `server/src/workouts/routes.ts`, `me/…` | HTTP only: parse, call the service and store, map errors                        |

## Scoring version v1

The server looks every exercise up by name in the catalog. Base points, tracking type, cardio
range, and cardio baseline come only from the catalog. Any `points`, `basePoints`, or award
fields in the request are ignored.

- Strength: `round(base × sets × reps / 8)`. Sets 1–20, reps 1–100, whole numbers.
- Cardio: `round(base × minutes / 20 × (0.75 + 0.25 × metric / baseline))`. Minutes 1–600; the
  metric must be within the catalog range for that exercise.
- Workout award: the sum of the rounded exercise awards.

Unknown exercises, out-of-range or non-numeric values, an empty list, or more than 50
exercises return `400` and create nothing. The same exercises and version always give the same
result. A new formula must be added as a new version (`v2`), never by changing `v1`.

Approved examples (also in `server/tests/scoring.test.ts`):

| Exercises                                  | Points         |
| ------------------------------------------ | -------------- |
| Barbell bench press 4×8                    | 96             |
| Outdoor run 20 min, 3 mi                   | 22             |
| Back squat 3×10 + Outdoor run 40 min, 6 mi | 105 + 55 = 160 |

## Submitting a scored workout

`POST /api/workouts` keeps the SCRUM-14 fields and adds two optional ones:

```json
{
  "name": "Push day",
  "category": "strength",
  "durationMinutes": 50,
  "completedAt": "2026-11-08",
  "submissionKey": "3f0c9a52-7c1e-4d0b-9d0e-0a6a4c1b2e77",
  "exercises": [
    { "name": "Barbell bench press", "sets": 4, "reps": 8 },
    { "name": "Dips", "sets": 3, "reps": 10 }
  ]
}
```

Response (`ScoredWorkoutResponse`): `201` with `{ workout, award, created: true }`. The award has
`points`, `scoringVersion`, and a per-exercise breakdown. Without `exercises`, the workout is
saved with `award: null` (existing SCRUM-14 behavior).

## Duplicate and concurrent submissions

`submissionKey` (8–128 of `A–Z a–z 0–9 _ -`) is required whenever `exercises` is sent. Generate
one per logged session (for example `crypto.randomUUID()`) and reuse it for every retry.

- `UNIQUE (user_id, submission_key)` means one workout per key per account.
- The insert uses `ON CONFLICT DO NOTHING`. PostgreSQL makes a concurrent insert of the same key
  wait for the first transaction, so exactly one wins.
- A retry returns `200` with the original workout and award and `created: false`.
- Reusing a key with different data returns `409`. Each submission stores a SHA-256 fingerprint
  of its normalized fields and exercises for this check.
- `workout_awards.workout_id` is the primary key, so a workout can never hold two awards.

The workout row, its exercises, and its award are written in **one transaction**. If any
statement fails, everything rolls back and the same key can be retried.

## Authoritative total

**The total is the sum of the persisted per-workout awards** (`workout_awards.points`) for the
signed-in user. Awards are never recalculated when read, so changing the formula in a later
version cannot change past totals. Workouts without exercises contribute nothing.

`GET /api/me/points` (`PointsResponse`):

```json
{
  "total": 182,
  "awardedWorkouts": 1,
  "breakdown": [
    {
      "workoutId": "0dfadb6e-…",
      "workoutName": "Push day",
      "completedAt": "2026-11-08",
      "points": 182,
      "scoringVersion": "v1",
      "exercises": [
        { "exerciseName": "Barbell bench press", "points": 96 },
        { "exerciseName": "Dips", "points": 86 }
      ]
    }
  ]
}
```

The total and breakdown come from one SQL statement, so they always agree. The endpoint takes no
user ID (`?userId=` is ignored); it needs a session and returns `401` without one.

## Edit and delete policy

Proposed for team approval; implemented as follows:

- `PUT /api/me/workouts/:id` replaces the workout's fields and exercises (same body as `POST`,
  without `submissionKey`). The row is locked, the exercises are replaced, and the award is
  re-scored in the same transaction. **The award keeps the scoring version it already had**, so
  an edit never moves an old workout to a newer formula. A workout with no award uses the
  current version. Sending no exercises removes the award.
- `DELETE /api/me/workouts/:id` returns `204`. The exercises and award are deleted with the
  workout (`ON DELETE CASCADE`), so the total drops by exactly that award.
- Both return `404` for a workout that does not exist or belongs to another account, and both
  require the `X-GatorGainz-Request: 1` header.

## Verification

`npm test` runs `scoring.test.ts` and `me.test.ts`; `npm run test:integration` (with
`TEST_DATABASE_URL`) runs `scoring-postgres.test.ts`.

| Criterion or test                     | Expected result                             | Actual result (Nov 9, 2026)                                                                         | Pass/Fail | Evidence                                           |
| ------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------- |
| Approved scoring examples             | 100% match                                  | 3 of 3 approved examples (96, 22, 160) plus 3 rounding/above-baseline fixtures match                | Pass      | `scoring.test.ts`                                  |
| Determinism                           | Same input and version → same result        | 20 repeated calculations identical                                                                  | Pass      | `scoring.test.ts`                                  |
| Invalid workouts                      | No award                                    | 10 invalid inputs rejected with 400; unsupported version throws                                     | Pass      | `scoring.test.ts`                                  |
| Client point total ignored            | Server value only                           | Request with `points: 999999` stored 96 (live run: 182 stored for `points: 99999`)                  | Pass      | `scoring.test.ts`, `me.test.ts`, live terminal run |
| 10 sequential retries                 | Exactly one award                           | 1 × `201` then 10 × `200`; 1 workout, 1 award, 1 exercise row                                       | Pass      | `scoring-postgres.test.ts`                         |
| 10 concurrent attempts                | Exactly one award                           | 1 × `201`, 9 × `200`, one workout ID; 1 award row (5 repeated runs)                                 | Pass      | `scoring-postgres.test.ts`                         |
| Simulated transaction failure         | No partial workout or award                 | Trigger failure → `500`; 0 workouts, 0 awards, 0 exercises; retry then `201` with one award         | Pass      | `scoring-postgres.test.ts`                         |
| Fixture reconciliation                | API total = independent sum                 | 6 fixtures: API total, breakdown sum, and SQL `SUM` all equal the hand-calculated sum; 0 mismatches | Pass      | `scoring-postgres.test.ts`                         |
| Edit and delete                       | Totals stay consistent                      | 118 → edit 142 → delete 22; no orphaned award or exercise rows; concurrent edits stay consistent    | Pass      | `scoring-postgres.test.ts`, `me.test.ts`           |
| Second account                        | Cannot read or change another's points      | B: `404` on edit/delete of A's workout; `?userId=A` still returns B's own total                     | Pass      | `scoring-postgres.test.ts`                         |
| CircleCI `check` job                  | Typecheck, PostgreSQL tests, build pass     |                                                                                                     | Pending   | Attach the CircleCI run for this PR                |
| Teammate review and SCRUM-74 sign-off | Approved examples and edit policy confirmed |                                                                                                     | Pending   | PR review                                          |
