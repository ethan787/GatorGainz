# CI and backend validation

GatorGainz uses CircleCI. The workflow is `build-and-test`, with one job named `check`.
The configuration lives in [`.circleci/config.yml`](../.circleci/config.yml).

## Connect the GitHub repository

1. Commit and push the CI changes to a branch in `ethan787/GatorGainz` and open a pull request.
2. Sign in to [CircleCI](https://app.circleci.com/) and choose **Create Project** or
   **Set up a project**, depending on your organization.
3. Connect GitHub, authorize the CircleCI GitHub App for `ethan787/GatorGainz`, and select
   that repository. If it is already connected, use its existing project.
4. Use the existing configuration at `.circleci/config.yml` on your branch. Keep a push
   trigger enabled so new commits run the pipeline.
5. Start the first run. Confirm the `check` job completes, the **Tests** tab contains
   both PostgreSQL suites, and the **Artifacts** tab contains coverage and JUnit reports.
6. After a successful run, optionally require the CircleCI check in the GitHub branch
   rules for your default branch. Select the actual check name reported on the pull request.

CircleCI documents both setup flows in its [project setup guide](https://circleci.com/docs/guides/getting-started/create-project/).
Repository access must be authorized in CircleCI/GitHub; a checked-in config alone does
not establish that connection.

The CI job creates a disposable PostgreSQL 17 service with the test database
`gatorgainz_auth_test`. Its credentials in the config are local to that CI service.
No production database connection or application secrets are needed for these tests.

## What a run checks

| Step               | Validation                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Install            | `npm ci` installs the exact dependencies in `package-lock.json`.                          |
| Typecheck          | `npm run typecheck` checks the client, backend, and test TypeScript.                      |
| Database readiness | A bounded connection check waits for the PostgreSQL service.                              |
| Backend validation | `npm run test:ci` requires `TEST_DATABASE_URL` and runs all Jest suites with coverage.    |
| Reports            | JUnit XML is uploaded to the Tests tab; raw results and coverage are stored as artifacts. |
| Build              | `npm run build` compiles the API and builds the production client.                        |

Test reports use [`jest-junit`](https://github.com/jest-community/jest-junit) and CircleCI's
[`store_test_results`](https://circleci.com/docs/guides/test/collect-test-data/) step.
Coverage is collected as a baseline; there is no minimum coverage gate yet.

## Run the same validation locally

Use the repository's supported Node.js version and install dependencies from the root:

```sh
npm ci
```

Start PostgreSQL. For a fresh Docker setup:

```sh
docker compose up -d db
docker compose exec db createdb -U gatorgainz gatorgainz_auth_test
```

Create the dedicated test database only once. If it already exists, keep it and skip
`createdb`. The prepared native Windows instance can instead be started with
`npm run db:local:start`; it already includes the dedicated test database.

Set `TEST_DATABASE_URL` to that database, using your local credentials. For Docker's
development defaults, in PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://gatorgainz:gatorgainz_local@127.0.0.1:5432/gatorgainz_auth_test'
npm run check:ci
```

Or in a POSIX shell:

```sh
TEST_DATABASE_URL='postgresql://gatorgainz:gatorgainz_local@127.0.0.1:5432/gatorgainz_auth_test' npm run check:ci
```

You can also set `TEST_DATABASE_URL` in the ignored `server/.env` file. Existing
environment variables take precedence. Never point tests at a production database.
The test role needs permission to create schemas in the dedicated database.

| Command                    | Purpose                                                                        |
| -------------------------- | ------------------------------------------------------------------------------ |
| `npm test`                 | Normal Jest run; PostgreSQL suites skip when no test URL is configured.        |
| `npm run test:integration` | Both `*-postgres.test.ts` suites; missing test URL is an error.                |
| `npm run test:ci`          | All backend tests, required PostgreSQL connection, JUnit output, and coverage. |
| `npm run check`            | Normal typecheck, tests, and build. Database tests remain optional.            |
| `npm run check:ci`         | Typecheck, required database validation, and build.                            |

Reports are written to `server/test-results/jest/junit.xml`; HTML coverage is at
`server/coverage/lcov-report/index.html`. These generated directories are ignored by Git.

## Backend coverage

- `app.test.ts`: public API responses, demo rankings and goal counts, JSON errors, and
  failed database health checks.
- `auth.test.ts` and `passwords.test.ts`: registration validation, login failures,
  password limits, session cookies, origin/header checks, throttling, and error handling.
- `auth-postgres.test.ts`: persisted accounts and sessions, duplicate registration races,
  transaction rollback, migration integrity, expiry, and logout.
- `fitness-postgres.test.ts`: actual SQL-backed health and fitness routes, public profile
  fields, workout dates and types, inclusive goal dates, ranking ties and zero-workout
  profiles, database constraints, and repeatable demo seeding.

Each PostgreSQL suite creates a randomly named schema, applies the real schema and
migrations there, and removes only its own schema afterward. Constraint tests modify
fixtures in that schema. Application tables are not truncated or seeded.

Workout and goal write endpoints are still future work. Their current validation tests
exercise database constraints; HTTP request and ownership tests should accompany those
endpoints when implemented.

## Diagnose the first failed run

- **No pipeline after a push:** verify repository access, the config path, the selected
  branch, and the push trigger in CircleCI project settings.
- **Missing `TEST_DATABASE_URL`:** the database-required commands deliberately fail rather
  than reporting success with skipped suites. Keep the job-level URL in the CI config.
- **Database connection or permission error:** check the PostgreSQL service, credentials,
  database name, and schema creation permissions. Readiness retries end after about 30 seconds.
- **Failed assertion:** open the Tests tab or download the JUnit artifact, then reproduce
  locally with `npm run test:integration` or `npm run test:ci`.
- **No reports:** a failure before Jest starts, such as dependency installation or the
  readiness check, cannot produce a JUnit report. Inspect that failed step's log.
