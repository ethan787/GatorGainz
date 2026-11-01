# CI quality gates

GitHub Actions runs [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for every
pull request targeting `main`, pushes to `main`, and merge queue groups. Manual runs
are available after the workflow reaches the default branch. There are no path filters:
documentation and configuration changes receive the same checks.

## Checks and reports

Jobs install locked dependencies with `npm ci` and use Node.js 22 from `.nvmrc`.
Static checks run independently so one failure does not hide the other results.

| GitHub check      | Local command                                 | Purpose                                                                                                                          |
| ----------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CI typecheck`    | `npm run typecheck`                           | Check client, server, tests, and shared API declarations. Every workspace must supply a typecheck script.                        |
| `CI lint`         | `npm run lint`                                | ESLint recommended JavaScript/TypeScript rules and React Hooks rules; warnings also fail.                                        |
| `CI format:check` | `npm run format:check`                        | Verify Prettier formatting without modifying files.                                                                              |
| `CI build`        | `npm run build`                               | Compile the API and bundle the production client.                                                                                |
| `CI tests`        | `npm run test:ci`                             | Run all backend Jest suites against disposable PostgreSQL 17, with JUnit and coverage reports.                                   |
| `CI quality gate` | `npm run check:ci` runs the underlying checks | Succeed only when every static/build check and the test job succeeds. Failed, cancelled, or skipped dependencies fail this gate. |

The final gate runs even when a dependency fails. Require the exact name **`CI quality gate`**
from the **GitHub Actions** app in the `main` branch rule. Keep this job name and branch
protection in sync if renaming it.

CI credentials are scoped to the disposable database `gatorgainz_auth_test`; no application
secrets are needed. Missing `TEST_DATABASE_URL` fails `test:ci` instead of skipping tests.
Each PostgreSQL suite creates its own random schema, applies real migrations, and removes
that schema afterward.

The `backend-test-reports` artifact contains `server/test-results/jest/junit.xml` and
`server/coverage/`, including `lcov-report/index.html`. Upload is attempted even after
test failure; failures before Jest starts may not produce reports. Artifacts are kept
for seven days. Coverage is a baseline report; no percentage threshold is imposed.

The existing [CircleCI configuration](../.circleci/config.yml) is retained for connected
CircleCI projects and includes the same formatting, lint, type, test, and build checks.
GitHub Actions is the required merge gate; a CircleCI connection is optional.

## Run the same checks locally

From the repository root, use Node.js 22 (`nvm use` where available), then:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` combines those five checks. `npm test` skips PostgreSQL suites when no
test URL is configured. To reproduce full CI validation, start a dedicated test database.
For a fresh Docker setup:

```sh
docker compose up -d db
docker compose exec db createdb -U gatorgainz gatorgainz_auth_test
```

Create the test database only once; skip `createdb` if it exists. The prepared native
Windows instance can instead be started with `npm run db:local:start`; it already includes
the dedicated test database.

For Docker's development credentials, in PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://gatorgainz:gatorgainz_local@127.0.0.1:5432/gatorgainz_auth_test'
npm run check:ci
```

Or in a POSIX shell:

```sh
TEST_DATABASE_URL='postgresql://gatorgainz:gatorgainz_local@127.0.0.1:5432/gatorgainz_auth_test' npm run check:ci
```

You can also set `TEST_DATABASE_URL` in ignored `server/.env`. Existing environment
variables take precedence. Use a dedicated test database whose role can create schemas.
Never use a production database.

| Command                    | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run format`           | Apply Prettier formatting; review the resulting diff.                                          |
| `npm run format:check`     | Report formatting differences without writing files.                                           |
| `npm run lint`             | Check source, tests, and JavaScript configuration. Generated output and `.local/` are ignored. |
| `npm run test:integration` | Run only the two PostgreSQL suites; a test URL is mandatory.                                   |
| `npm run test:ci`          | Run all backend suites, require PostgreSQL, and generate reports.                              |
| `npm run check`            | Formatting, lint, types, normal tests, and build.                                              |
| `npm run check:ci`         | Formatting, lint, types, all tests with required PostgreSQL, and build.                        |

## Protect main

Workflow files run checks; GitHub branch protection makes them mandatory. A repository
administrator must configure this separately. The connected GitHub integration may have
code/PR access without the Administration permission needed for branch rules.

After the workflow successfully runs on a pull request:

1. Open **Settings > Branches > Add classic branch protection rule** and target `main`.
2. Enable **Require a pull request before merging**. This baseline does not require an
   additional reviewer; add that requirement separately if the team chooses one.
3. Enable **Require status checks to pass before merging**, select **CI quality gate**
   from **GitHub Actions**, and enable **Require branches to be up to date before merging**.
4. Enable **Require conversation resolution before merging** and **Do not allow bypassing
   the above settings**, so administrators also follow the rule.
5. Keep force pushes and branch deletion disabled, and save the rule.
6. Verify a failing gate prevents merging and that the corrected commit satisfies it.

An administrator with an authenticated GitHub CLI can use the checked-in
[`main-branch-protection.json`](../.github/main-branch-protection.json). It describes the
same baseline and binds the check to GitHub Actions (app ID 15368 on GitHub.com):

```sh
gh api --method PUT repos/ethan787/GatorGainz/branches/main/protection --input .github/main-branch-protection.json
gh api repos/ethan787/GatorGainz/branches/main/protection
```

Inspect existing rules and preserve stronger requirements before applying this payload.
A `403` means the credentials lack administration access; an administrator must apply the
rule through Settings or their own CLI. Do not put an administrator token in CI. Until
the rule is saved, failed checks are visible but do not enforce the merge policy.

## Emergency merge process

Use this exception only for an urgent production incident when waiting for a failed
check would prevent recovery. Routine feature work must pass CI.

1. Keep the fix in a PR. Record the incident, exact commit, failed checks, reason a bypass
   is necessary, manual verification, and rollback plan in its description.
2. Obtain explicit approval from a repository administrator and record who authorized
   it and when. Get a second maintainer's review when one is available.
3. The administrator may temporarily permit their own bypass for that PR. Keep the
   required check configured; do not mark failures successful or add a workflow shortcut.
4. Immediately restore administrator enforcement after merging and verify the rule.
   The checked-in protection payload can restore the baseline.
5. Rerun CI on `main`. Link a follow-up issue for remaining failures, assign an owner, and
   resolve them within 24 hours. Record restored protection and the CI outcome on the PR.

An assistant or CI job must not invoke this exception automatically.

## Verify or diagnose a run

Open a draft PR targeting `main` and confirm all six named checks appear. For a controlled
failure test on that branch, commit a deliberately misformatted tracked file, confirm
`CI format:check` and `CI quality gate` fail, then remove or format the file and push again.
Confirm the newest commit passes all checks. Do not merge the failing revision.

- **No checks:** inspect the workflow YAML, repository Actions settings, and any approval
  required for a fork's first workflow run.
- **Formatting failure:** run `npm run format`, review the diff, and rerun `format:check`.
- **Lint failure:** fix the reported rule. Underscore-prefixed unused callback parameters
  are allowed. Intentional exceptions need a narrow, explained suppression, as with the
  authentication control-character rejection regexes.
- **Database failure:** inspect the PostgreSQL service health and test connection URL.
- **Assertion failure:** download the reports and reproduce with `test:ci` or
  `test:integration` against the dedicated database.
- **Required gate stays pending:** verify its exact name/app in branch protection, ensure
  the workflow runs for the PR, and update the branch when `main` changes.

## Existing backend test coverage

- `app.test.ts`: public API responses, demo rankings/goal counts, JSON errors, database health.
- `auth.test.ts` and `passwords.test.ts`: registration, login, password limits, session
  cookies, origin/header checks, throttling, and error handling.
- `auth-postgres.test.ts`: persisted accounts/sessions, duplicate registration races,
  rollback, migration integrity, expiry, and logout.
- `fitness-postgres.test.ts`: SQL-backed fitness routes, public fields, workout dates,
  goal boundaries, ranking ties, constraints, and repeatable seeding.

Workout/goal write routes and browser interaction tests should accompany those features
as they are implemented. Current automated behavioral coverage is focused on the backend.
