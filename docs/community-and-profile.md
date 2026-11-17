# Community, connections, invites, and profiles

Owner: Luke Easterling. Builds on server-side scoring and workout history
([workout-scoring.md](workout-scoring.md), [workout-history.md](workout-history.md)).

Every number in Community and on the Account page now comes from PostgreSQL. The app no longer
shows sample leaders, squads, streaks, levels, or badges, and no point totals live in the browser.

## What other people can see

| Data                                        | You | Connections | Other signed-in users              |
| ------------------------------------------- | --- | ----------- | ---------------------------------- |
| Name, username, level, total points         | ✓   | ✓           | Only if your profile is **public** |
| Bio, goal, training level, units, streaks   | ✓   | —           | —                                  |
| Email                                       | ✓   | —           | —                                  |
| Individual workouts and per-exercise points | ✓   | —           | —                                  |

- **Public** (default): findable by name or username, listed on the global leaderboard.
- **Private**: hidden from search and the global board. Only existing connections see you, and
  new people can reach you only through your invite link.
- Demo/sample profiles (no password) never appear in Community.
- Every response is `Cache-Control: no-store` and requires the session cookie, except the invite
  preview, which reveals only the inviter's name and username.

## Connections

A connection needs both people to agree.

1. `POST /api/me/connections { "handle": "maya_chen" }` sends a request (state `outgoing`).
2. The other person sees it as `incoming` (Community and the notification bell) and can
   `POST /api/me/connections/:userId/accept` or `DELETE /api/me/connections/:userId`.
3. If both people request each other, the second request accepts the first.

Declining, cancelling, and disconnecting are the same `DELETE` and do not notify anyone.
Changes to one pair are serialized with a PostgreSQL advisory lock, and a unique index on the
unordered pair means two people can never have two rows.

**Limits** (anti-spam): 50 pending outgoing requests at once and 30 new requests per 24 hours
(`429`). A private account, a blocked account, and a nonexistent username all return the same
`404`, so usernames cannot be probed.

**Blocking**: `POST /api/me/blocks { "userId" }` removes any connection or request and hides both
accounts from each other in search, leaderboards, requests, and invites. `GET /api/me/blocks`
lists them; `DELETE /api/me/blocks/:userId` unblocks.

## Invite links

Each account has a personal invite code (12 random URL-safe characters). The app builds the link
`https://<site>/?invite=<code>`.

1. **Share invite** uses the device share sheet when available (`navigator.share`), otherwise
   copies the link to the clipboard; if both are blocked, the link is shown to copy by hand.
2. Opening the link stores the code in session storage and removes it from the address bar.
   The sign-in screen shows who invited you (`GET /api/invites/:code`, rate-limited to 30 per
   15 minutes per IP) and opens on **Create account**.
3. After signing in, a banner asks **Connect with Maya?** Choosing Connect calls
   `POST /api/me/connections { "inviteCode" }`, which connects immediately: the inviter agreed by
   sharing and the visitor agreed by clicking. This also works for private profiles.
4. **Reset link** (`POST /api/me/invite`) issues a new code; old links stop working.

There is **no point reward** for invites. The previous "earn 100 points" text was removed: points
come only from scored workouts, so invites cannot be farmed for points.

## Leaderboards

`GET /api/community/leaderboard?scope=global|connections&range=week|month|all&today=YYYY-MM-DD`

- `global`: public accounts plus you. `connections`: accepted connections plus you.
- `week` = the 7 days ending today; `month` = 30 days; `all` = all time. Points are the sum of
  persisted workout awards completed in the range.
- Ranks use SQL `RANK()` (ties share a rank). Top 50 are returned; `you` is always included.
- `today` is the user's local date; it is accepted only within one day of the server's UTC date.

## Profile

`GET /api/me/profile?today=YYYY-MM-DD` returns the profile, computed stats, badges, and connection
count. `PATCH /api/me/profile` changes any of: `fullName`, `handle`, `bio` (≤160), `primaryGoal`,
`trainingLevel`, `preferredUnits`, `weeklyGoal` (1–14), `visibility`. Unknown fields such as
`email` or `userId` are rejected with 400. A taken username returns 409; reserved names (admin,
support, gatorgainz, …) return 400.

A profile and username are created at registration (`luke_easterling`, or
`luke_easterling_48213` if taken). Migration 003 creates profiles for existing accounts.

| Stat           | How it is calculated                                                    |
| -------------- | ----------------------------------------------------------------------- |
| Total points   | Sum of persisted awards                                                 |
| Level          | `floor(points / 500) + 1`                                               |
| Current streak | Consecutive workout days ending today (or yesterday, if not logged yet) |
| Longest streak | Longest run of consecutive workout days                                 |
| Last 7 days    | Workouts, points, and minutes per day, ending today                     |
| Global rank    | Position by all-time points among public profiles; `null` when private  |
| Badges         | 8 milestones computed from the stats above                              |

## Workout logging in the app

The logger now submits sessions to `POST /api/workouts` with exercises and a `submissionKey` saved
in the draft, so a retry after a lost response cannot double-award. The toast shows the
server's award, and the dashboard, sidebar, top bar, and Account page reload from the server.

## Verification

`npm test` runs `server/tests/community.test.ts` (25 unit tests). With `TEST_DATABASE_URL`,
`npm run test:integration` runs `server/tests/community-postgres.test.ts` (16 tests).

| Criterion or test                 | Expected result                                         | Actual result (Nov 16, 2026)                                                                     | Pass/Fail | Evidence                               |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- | -------------------------------------- |
| Profile stats from saved workouts | Points, streaks, 7-day totals, rank match fixtures      | 5 workouts: 480 pts, streak 3/3, 7-day 4 workouts/384 pts, rank 1, correct badges                | Pass      | community-postgres "creates a profile" |
| Profile edits and validation      | Valid fields saved; email/userId/reserved/taken refused | 8 fields saved and reflected in `/api/auth/me`; 11 bad bodies 400; taken username 409            | Pass      | "updates profile fields…"              |
| Search exposes no private data    | Only card fields; no email; wildcards literal           | Exactly 6 card fields; no email in body; `%%` and `__` match nothing                             | Pass      | "finds public accounts…", "treats…"    |
| Private profiles                  | Hidden from search/global board; invite still works     | Not found by search, board, or username (404); invite connected; then visible to that connection | Pass      | "hides private accounts…"              |
| Mutual consent                    | Requester cannot self-accept; addressee must accept     | Self-accept 404; addressee accept → connected on both sides                                      | Pass      | "requires the other person…"           |
| Simultaneous mutual requests      | Exactly one accepted row                                | Two concurrent requests → one `accepted` row                                                     | Pass      | "keeps one row…"                       |
| Request limits                    | 30/day then 429                                         | 30 × 201, 31st 429                                                                               | Pass      | "rejects yourself…"                    |
| Blocking                          | Connection removed; hidden both ways; invite blocked    | Removed; hidden in search both ways and on board; username and invite 404; unblock restores      | Pass      | "blocking removes…"                    |
| Leaderboard ranges and scopes     | Range sums and ranks match fixtures                     | Week 120/48/0, month 360, all 360/240/48; connections scope only after accepting                 | Pass      | "ranks by server-awarded points…"      |
| Invite links                      | Preview, connect, reset invalidates old link            | Preview name+username only; connected; own link 400; old code 404 after reset                    | Pass      | "previews, connects through…"          |
| Sessions and demo mode            | 401 without session; 503 without PostgreSQL             | 8 private routes 401; community/invite/profile 503 in demo; public routes still 200              | Pass      | last two tests                         |
| End-to-end in a browser           | Invite → sign up → connect → log → rank → edit          | Headless Chrome run against the built API and PostgreSQL: every step passed (17 screenshots)     | Pass      | Screenshots attached to the PR         |
| CircleCI `check` job              | Typecheck, PostgreSQL tests, build pass                 |                                                                                                  | Pending   | Attach the CircleCI run                |
| Teammate review                   | Approved                                                |                                                                                                  | Pending   | PR review                              |
