# GatorGainz

GatorGainz combines the Figma-designed fitness interface with an Express REST API. Users register and sign in with accounts and sessions saved in PostgreSQL. The client includes workout logging, points, community views, and light/dark themes. Workout drafts, history, and pinned exercises currently stay in the browser, scoped to the signed-in account.

## Stack

| Area      | Technology                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Language  | TypeScript across client, server, and shared API contracts                 |
| Client    | React, Vite, Tailwind CSS 4, custom CSS                                    |
| Server    | Node.js, Express                                                           |
| Database  | PostgreSQL via `pg`                                                        |
| Passwords | bcrypt password hashing with database-backed cookie sessions               |
| Tests     | Jest and Supertest                                                         |
| Tooling   | npm workspaces, CircleCI, Git; suggested Jira backlog in `docs/backlog.md` |

## Run locally

Use Node.js 22.12+ (Node.js 20.19+ is also supported) and npm. From the repository root:

```sh
npm install
```

Configure PostgreSQL using the next section, then run `npm run dev` and open **http://127.0.0.1:5173**. The root command starts the Figma-designed client in `client/` and the API at **http://127.0.0.1:3001/api/health**. Vite proxies `/api` requests to Express, so no client environment file is needed. Stop both processes with **Ctrl+C**.

Choose **Create account** on the first screen. Use a name, email address, and password of at least 15 characters and at most 72 UTF-8 bytes. Registration signs you in, and your session survives a page reload. To sign out, open **Account → Settings → Log out of GatorGainz**. You can then log in using the registered email and password, including from another browser. Account records are shared through PostgreSQL; workout data stays in the browser where it was created. Some statistics, community entries, and controls remain sample data or placeholders.

The former standalone `figma-ui/` export has been consolidated into `client/`, replacing the original dashboard. There is one frontend, installed and checked through the root npm workspace commands; pnpm and the separate port 8443 preview are no longer needed. Prototype accounts formerly stored in localStorage are removed when the app opens and are not migrated into real accounts. Register a new server account; old shared workout storage is not assigned to it.

## Use PostgreSQL

1. For a fresh setup, copy `server/.env.example` to `server/.env`. Preserve an existing environment file.
2. Start a local database with `docker compose up -d db`, or use your own PostgreSQL instance.
3. Set `DATABASE_URL` in `server/.env`. For the included local database:

   ```dotenv
   DATABASE_URL=postgresql://gatorgainz:gatorgainz_local@127.0.0.1:5432/gatorgainz
   ```

4. Run `npm run db:setup` to create the base schema and apply versioned migrations from `db/migrations/`. It does not insert demo profiles. Optionally run `npm run db:seed` to add synthetic sample profiles for the public preview API.
5. Start or restart `npm run dev`. Open **http://127.0.0.1:3001/api/health** and confirm `dataSource` is `postgres`.

Setup runs in a transaction and records migration checksums. It can be repeated without resetting accounts, passwords, or sessions. Later schema changes belong in a new migration. The local Docker credentials are development defaults. `docker compose stop` stops the database while preserving its volume.

This Windows workspace also has a prepared native PostgreSQL instance and a configured `server/.env`. To use it, run `npm run db:local:start`, then `npm run dev`. Use `npm run db:local:status` to check it and `npm run db:local:stop` when finished. Its runtime and database files are stored in the ignored `.local/postgresql/` folder; fresh checkouts need the Docker setup above or their own PostgreSQL installation. See [the authentication guide](docs/authentication.md) for native setup details.

**PostgreSQL is required for registration and login.** With an empty `DATABASE_URL`, the public fitness endpoints can still serve in-memory demo data, but account endpoints return HTTP 503 and the client shows a retry state. With a configured URL, the API uses PostgreSQL and reports connection failures instead of falling back to demo accounts. The health endpoint checks database connectivity.

See [the authentication implementation guide](docs/authentication.md) for the exact request flow, SQL tables, session handling, security choices, review steps, and limitations.

## Project layout

```text
client/
  src/App.tsx                    Figma-designed screens, account flow, local workouts
  src/auth-api.ts                Typed registration, login, session, and logout requests
  src/index.css                  Tailwind import, branding, themes, and responsive styles
  src/assets/gator-gainz-mark.png GatorGainz logo
  vite.config.ts                 React, Tailwind CSS, and API proxy
server/
  src/app.ts                     Express routes and error handling
  src/data/                      Demo and PostgreSQL data stores
  src/auth/                     Account routes, bcrypt helpers, SQL session storage
  src/database/setup.ts         Transactional migration runner
  scripts/setup-db.ts            Schema setup and optional sample-data seeding
  tests/                         Jest API and password tests
shared/index.d.ts                Client/server API contracts
db/                             PostgreSQL schema, versioned migrations, sample rows
docs/authentication.md           Account implementation and code-review guide
docs/backlog.md                  Starter tasks for Jira
.circleci/config.yml             Install, typecheck, test, and build
docs/ci.md                       CircleCI connection and backend validation guide
```

## API

Account endpoints create and verify database accounts and sessions. Register/login accept JSON. All authentication POST requests require `X-GatorGainz-Request: 1`; the client supplies the header and sends the session cookie automatically. Account responses never include password hashes or session tokens in JSON. Session tokens use an `HttpOnly`, `SameSite=Lax` cookie; production adds `Secure`.

| Method | Endpoint             | Request / response                                                                                     |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/api/auth/register` | `{ fullName, email, password }` → 201 `{ user: { id, fullName, email, joinedAt } }` and session cookie |
| POST   | `/api/auth/login`    | `{ email, password }` → 200, same user fields and a new session cookie                                 |
| GET    | `/api/auth/me`       | Session cookie → 200 `{ user }`, or 401 when the session is missing, invalid, expired, or revoked      |
| POST   | `/api/auth/logout`   | Session cookie → 204, deletes the server session and clears the cookie                                 |

Registration normalizes email addresses, rejects duplicate emails with 409, and hashes passwords with bcrypt. Incorrect login credentials return the same generic 401 response. Validation errors use 400 and rate limits use 429. Errors have the shape `{ error: string }`. See [the API contract](docs/authentication.md#api-contract) for limits and request verification.

The existing public fitness preview endpoints remain read-only:

| Method | Endpoint        | Response                                                     |
| ------ | --------------- | ------------------------------------------------------------ |
| GET    | `/api/health`   | Status and data source (`demo` or `postgres`)                |
| GET    | `/api/users`    | Public profile IDs and display names                         |
| GET    | `/api/workouts` | Workout history for all preview profiles                     |
| GET    | `/api/goals`    | Goals and workout counts within each goal's date range       |
| GET    | `/api/rankings` | All-time workout totals, ranked by count then active minutes |

Rankings are a SQL view computed from workouts. Goals count workouts between their start and target dates, inclusive. Both calculations also work in demo mode. Public profile responses exclude emails and password hashes. Sample profiles have no password and cannot sign in. Unknown routes return a JSON 404; unexpected errors return a generic JSON 500.

## Checks and builds

```sh
npm run typecheck
npm test
npm run build
# Run all three:
npm run check
# Require PostgreSQL tests and generate CI reports:
npm run check:ci
```

CircleCI installs from the lockfile, checks TypeScript, runs all backend tests against a dedicated PostgreSQL service, uploads JUnit results and coverage, and builds the client and API. `npm run check:ci` reproduces these checks locally and requires `TEST_DATABASE_URL`; `npm run test:integration` runs just the PostgreSQL suites and also requires that URL. Normal `npm test` and `npm run check` skip database suites when the URL is absent. See [the CI and backend validation guide](docs/ci.md) to connect `ethan787/GatorGainz` in CircleCI and run the checks locally. The logo is included directly in the client assets, so the app no longer requires a separate Git LFS download.

Run `npm run format` to format source and configuration files with Prettier.

Dependency audit note (October 8, 2026): Jest's development dependency chain includes `sprintf-js`, which has an [unpatched moderate advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). The high-severity findings were removed by updating Jest. This remaining finding affects development tooling rather than the app's runtime dependencies.

Build output goes to `client/dist` and `server/dist`. `npm run start --workspace server` runs the compiled API. The scaffold does not include deployment wiring: a future deployment should serve the client and route `/api` to the server. The server binds to loopback for local development, and the Vite proxy expects port 3001; update `client/vite.config.ts` if you change the API port.

## Next steps

Connect the workout logger to authenticated API write routes with ownership checks, then add goal management. Workout browser storage is scoped by user ID but does not sync between devices. Email verification, password reset, and deployment configuration remain future work; the account implementation guide records the current limits.

See [the starter backlog](docs/backlog.md) for small tasks to copy into Jira. The scaffold does not create an external Jira project or configure a CircleCI account connection.
