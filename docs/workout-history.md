# Private workout history — `GET /api/me/workouts`

Owner: Luke Easterling. Depends on SCRUM-14 (authenticated workout writes) and the shared
contracts in `shared/index.d.ts` (SCRUM-9).

## Contract

Requires PostgreSQL and the `gatorgainz_session` cookie. The owner is always the signed-in
account; the endpoint accepts no user ID. Responses are `Cache-Control: no-store`.

```text
GET /api/me/workouts?limit=20&start=2026-10-01&end=2026-10-31&cursor=<nextCursor>
```

| Parameter | Rules                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| `limit`   | Whole number 1–100. Default 20.                                                           |
| `start`   | Optional calendar date `YYYY-MM-DD`, **inclusive**.                                       |
| `end`     | Optional calendar date `YYYY-MM-DD`, **inclusive**. Must be on or after `start`.          |
| `cursor`  | Optional. The `nextCursor` value from the previous page. Opaque; do not build it by hand. |

Any other parameter (`page`, `offset`, …), a repeated parameter, an impossible date, or a
malformed cursor returns `400 { "error": "<what to fix>" }`.

Response (`WorkoutHistoryResponse`):

```json
{
  "items": [
    {
      "id": "0dfadb6e-…",
      "userId": "d818f4e2-…",
      "name": "Push day",
      "category": "strength",
      "durationMinutes": 50,
      "completedAt": "2026-11-08",
      "recordedAt": "2026-11-09T23:54:26.910482Z",
      "points": 182,
      "scoringVersion": "v1"
    }
  ],
  "pagination": { "limit": 20, "hasMore": false, "nextCursor": null }
}
```

`points` and `scoringVersion` come from the persisted award (see
[workout-scoring.md](workout-scoring.md)); they are `null` for workouts saved without exercises.

## Ordering and continuation

Items are sorted newest first by `completedAt DESC, recordedAt DESC, id DESC`. `recordedAt` is
the server insert time; `id` breaks any remaining tie, so the order is total and stable.

Pagination is keyset-based. When `hasMore` is true, send `nextCursor` as `cursor` to get the
next page. The cursor holds the last item's `(completedAt, recordedAt, id)` and the original
`start`/`end`. On continuation you may omit `start`/`end` or repeat them unchanged; changing
them returns 400. Because each page starts strictly after the previous page's last key, an
unchanged dataset is traversed with no skipped or duplicated records. If workouts are added
while paging, newer ones appear only on a fresh first page; deleted ones simply drop out.

## Dates and time zones

`completedAt` is a calendar date with no time zone: the day the user says they trained, as
validated by `POST /api/workouts`. `start` and `end` are compared to that date directly, with no
time-zone conversion, so `start=2026-10-01&end=2026-10-31` means every workout dated in October
regardless of where the request comes from. `recordedAt` is a UTC timestamp and is used only for
ordering.

## Errors

| Situation                                         | Response                                   |
| ------------------------------------------------- | ------------------------------------------ |
| No cookie, unknown token, expired or revoked      | `401 { "error": "Please sign in…" }`       |
| Invalid limit, date, cursor, or unknown parameter | `400` with a specific message              |
| No `DATABASE_URL` (demo mode)                     | `503`; never demo or sample history        |
| Database query fails                              | `500 { "error": "Unable to complete…" }`   |
| Account has no workouts                           | `200` with `items: []`, `nextCursor: null` |

## Relationship to the public preview endpoints

`GET /api/workouts`, `/api/users`, `/api/goals`, and `/api/rankings` are the public,
read-only fitness preview. They work without an account and in demo mode, and never include
emails, password hashes, points breakdowns, or pagination.

`GET /api/me/workouts` is private: it needs a session, reads only PostgreSQL, returns only the
caller's workouts, and includes award data. It does not share code paths with the public list.
`GET /api/workouts/mine` (SCRUM-14) still returns the caller's full, unpaginated list and is
kept for compatibility; new client code should use `/api/me/workouts`.

> Known gap for the team: the public `GET /api/workouts` lists every row in `workouts`,
> including workouts saved by registered accounts (names, dates, and user IDs). That was
> already true after SCRUM-14. If those should stay private, the preview should be limited to
> sample profiles in a separate task.

## Verification

Run locally with `TEST_DATABASE_URL` set: `npm run test:integration` runs
`server/tests/history-postgres.test.ts`; `npm test` runs `server/tests/me.test.ts`.

| Criterion or test                 | Expected result                                   | Actual result (Nov 9, 2026)                                                                                       | Pass/Fail | Evidence                                                 |
| --------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------- |
| Owner isolation, accounts A and B | Every item's `userId` is A; no B IDs              | 45 items, all owned by A; 0 of B's 7 IDs returned                                                                 | Pass      | `history-postgres.test.ts` "returns only account A’s…"   |
| 45 seeded workouts, default size  | Pages of 20/20/5; 45 unique IDs; matches DB order | Pages 20, 20, 5; 45 unique IDs, identical to the SQL `ORDER BY` list                                              | Pass      | same test                                                |
| Identical dates and insert times  | Each ID once, ordered by ID                       | 7 tied rows over 4 pages (`limit=2`): 7 unique, descending ID order                                               | Pass      | "breaks identical completion dates…"                     |
| Empty history                     | `200`, `items: []`, `nextCursor: null`            | `200` with empty items and null cursor                                                                            | Pass      | "returns 200 and an empty collection…"                   |
| Date boundaries (5 windows)       | Inclusive `start` and `end`, nothing outside      | 5 of 5 windows returned exactly the expected dates, including single-day and empty windows                        | Pass      | "applies inclusive calendar-date boundaries exactly"     |
| Invalid parameters                | `400` with message                                | `limit=0`, `limit=101`, `page`, impossible date, `start > end`, bad cursor all `400` (15 cases in unit tests)     | Pass      | history-postgres + `me.test.ts`                          |
| Missing, expired, revoked session | `401`                                             | All three `401` (expired set in `auth_sessions`, revoked via logout)                                              | Pass      | "returns 401 for missing, expired, and revoked sessions" |
| Logout/login persistence          | Same IDs and values                               | All 45 items deep-equal after logout and a new login                                                              | Pass      | "keeps identical records after logout/login…"            |
| API restart persistence           | Same IDs and values from a new browser session    | New pool + app instance and new login: deep-equal; live run: stopped and restarted `node dist/index.js`, `cmp` OK | Pass      | same test; live terminal run on local PostgreSQL 16      |
| Database unavailable              | Error, no sample history                          | `500 Unable to complete the request.` with sessions on a live DB and on a dead DB                                 | Pass      | "returns an error, never sample history…"                |
| CircleCI `check` job              | Typecheck, PostgreSQL tests, build pass           |                                                                                                                   | Pending   | Attach the CircleCI run for this PR                      |
| Teammate review                   | Approved                                          |                                                                                                                   | Pending   | PR review                                                |
