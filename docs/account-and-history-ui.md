# Workout history, editing, profiles, security, and welcome flow

Owner: Luke Easterling. Builds on [community-and-profile.md](community-and-profile.md).

## What users can do

| Feature                | Where in the app                                                            | API                                                                     |
| ---------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Full workout history   | Overview → Recent activity → **View all**, or Account → **Workout history** | `GET /api/me/workouts` (date filters, Load more)                        |
| Workout details        | Tap a workout in History                                                    | `GET /api/me/workouts/:id` (new)                                        |
| Edit a workout         | Workout details → **Edit**                                                  | `PUT /api/me/workouts/:id`                                              |
| Delete a workout       | Workout details → **Delete** → confirm                                      | `DELETE /api/me/workouts/:id`                                           |
| View someone's profile | Tap a name in Community (leaderboard, search, connections)                  | `GET /api/community/people/:userId` (new)                               |
| Change password        | Account → Sign-in and security                                              | `POST /api/auth/password` (new)                                         |
| Sign out other devices | Account → Sign-in and security                                              | `GET /api/auth/sessions`, `POST /api/auth/sessions/revoke-others` (new) |
| Delete account         | Account → Sign-in and security → Delete account                             | `DELETE /api/auth/account` (new)                                        |
| Welcome flow           | Shown once after sign-up                                                    | `PATCH /api/me/profile` with `onboarded: true`                          |

## Rules

- **Editing** re-scores the workout on the server under the scoring version it already had.
  Removing every exercise removes its points. The date cannot be in the future.
- **Person profile** shows only name, username, level, total points, and connection state, with
  Connect / Accept / Decline / Cancel / Remove / Block. Private, blocked, and unknown accounts
  (and yourself) return the same 404.
- **Change password** needs the current password (wrong → 403). The new one follows the sign-up
  rules (15+ characters, ≤72 bytes) and must differ. Every other session is signed out in the
  same transaction; the current one stays signed in.
- **Delete account** needs the password and the word `DELETE`. It removes the account and, by
  cascade, its sessions, workouts, exercises, awards, profile, connections, and blocks, then clears
  the cookie. Other users' data is unaffected.
- Password and delete attempts share a limit of 10 failures per 15 minutes per IP.
- **Welcome flow** (migration 004 adds `user_profiles.onboarded_at`): three steps for name and
  username, goal/level/weekly target, and public/private. **Skip for now** keeps the defaults.
  Existing accounts are marked as onboarded by the migration, so only new sign-ups see it.
- **Units** are hidden in the app because the logger has no weight field yet. The column stays in
  the database for when weights are added.

## Verification

`server/tests/account-postgres.test.ts` (7 PostgreSQL tests) plus a headless Chrome run.

| Criterion or test       | Expected result                                                                               | Actual result (Nov 24, 2026)                                                                           | Pass/Fail | Evidence                   |
| ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- | -------------------------- |
| Change password         | Current password required; others signed out                                                  | Wrong current 403; 3 bad bodies 400; success 204; this session kept, other 401; new login works        | Pass      | account-postgres           |
| Sign out other devices  | Only other sessions removed                                                                   | 2 revoked; current still signed in; count 1                                                            | Pass      | account-postgres           |
| Delete account          | Confirm + password; all owned data removed                                                    | 400 without DELETE, 403 wrong password; 204; 0 rows left in 7 tables; other user unaffected            | Pass      | account-postgres           |
| Welcome flow            | New users unfinished; finishing saves choices                                                 | `onboarded` false → true with username, goal, visibility saved; `false` rejected                       | Pass      | account-postgres           |
| Workout detail          | Owner sees exercises and per-exercise points                                                  | 2 exercises with 105 + 55 pts; other account 404                                                       | Pass      | account-postgres           |
| Person lookup           | Public/connected visible; private, blocked, self hidden                                       | 6 card fields only; private 404 until connected; blocked 404; self 404                                 | Pass      | account-postgres           |
| End-to-end in a browser | Sign up → welcome → log → history → edit → delete → profile sheet → security → delete account | Every step completed with no page errors (18 screenshots), including the other device being signed out | Pass      | Screenshots attached to PR |
| CircleCI `check` job    | Pass                                                                                          |                                                                                                        | Pending   | Attach the CircleCI run    |
| Teammate review         | Approved                                                                                      |                                                                                                        | Pending   | PR review                  |
