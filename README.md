# GatorGainz

A small fitness app scaffold built from the supplied stack table. It covers users, workouts, goals, and community rankings with a read-only dashboard and REST API. The app runs with synthetic demo data by default; PostgreSQL is optional for the first run.

## Stack

| Area      | Technology                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Language  | TypeScript across client, server, and shared API contracts                 |
| Client    | React, Vite, Chart.js, plain CSS                                           |
| Server    | Node.js, Express                                                           |
| Database  | PostgreSQL via `pg`                                                        |
| Passwords | bcrypt helpers prepared for future account routes                          |
| Tests     | Jest and Supertest                                                         |
| Tooling   | npm workspaces, CircleCI, Git; suggested Jira backlog in `docs/backlog.md` |

## Run locally

Use Node.js 22.12+ (Node.js 20.19+ is also supported) and npm. From the repository root:

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://127.0.0.1:3001/api/health**. Vite proxies `/api` requests to Express, so no client environment file is needed. No database or account is required for demo mode.

The preview includes a profile selector, workout history, a chart of active minutes, workout-count goals, and all-time rankings. Profile selection is for browsing the sample data; it is not authentication. Sample dates are fixed to October 2026.

## Use PostgreSQL

1. Copy `server/.env.example` to `server/.env`.
2. Start a local database with `docker compose up -d db`, or use your own PostgreSQL instance.
3. Set `DATABASE_URL` in `server/.env`. For the included local database:

   ```dotenv
   DATABASE_URL=postgresql://gatorgainz:gatorgainz_local@localhost:5432/gatorgainz
   ```

4. Run `npm run db:setup` to apply `db/schema.sql` and `db/seed.sql`.
5. Start or restart `npm run dev`. The dashboard badge should say **Database connected**.

Setup runs in a transaction and can be repeated without duplicating sample rows. Later schema changes should use versioned migrations. The local Docker credentials are development defaults. `docker compose stop` stops the database while preserving its volume.

With an empty `DATABASE_URL`, the API uses in-memory demo data. With a configured URL, it uses PostgreSQL and reports connection failures instead of falling back to demo data. The health endpoint checks database connectivity.

## Project layout

```text
client/
  src/App.tsx                    Dashboard and profile selector
  src/api.ts                     Typed API requests
  src/components/ProgressChart.tsx
server/
  src/app.ts                     Express routes and error handling
  src/data/                      Demo and PostgreSQL data stores
  src/auth/passwords.ts          bcrypt hash/verify helpers
  scripts/setup-db.ts            Schema and sample-data setup
  tests/                         Jest API and password tests
shared/index.d.ts                Types shared by client and server
db/                             PostgreSQL schema and sample rows
docs/backlog.md                  Starter tasks for Jira
.circleci/config.yml             Install, typecheck, test, and build
```

## API

All endpoints are read-only and return JSON. Unknown routes return a JSON 404; unexpected errors return a generic JSON 500.

| Method | Endpoint        | Response                                                     |
| ------ | --------------- | ------------------------------------------------------------ |
| GET    | `/api/health`   | Status and data source (`demo` or `postgres`)                |
| GET    | `/api/users`    | Public profile IDs and display names                         |
| GET    | `/api/workouts` | Workout history for all preview profiles                     |
| GET    | `/api/goals`    | Goals and workout counts within each goal's date range       |
| GET    | `/api/rankings` | All-time workout totals, ranked by count then active minutes |

Rankings are a SQL view computed from workouts. Goals count workouts between their start and target dates, inclusive. Both calculations also work in demo mode. Emails and password hashes are excluded from API responses. Sample profiles have no password and cannot sign in.

## Checks and builds

```sh
npm run typecheck
npm test
npm run build
# Run all three:
npm run check
```

CircleCI runs `npm ci` and `npm run check` on commits using the lockfile. Jest covers API responses, goal progress, rankings, error handling, and bcrypt password helpers.

Run `npm run format` to format source and configuration files with Prettier.

Dependency audit note (October 8, 2026): Jest's development dependency chain includes `sprintf-js`, which has an [unpatched moderate advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). The high-severity findings were removed by updating Jest. This remaining finding affects development tooling rather than the app's runtime dependencies.

Build output goes to `client/dist` and `server/dist`. `npm run start --workspace server` runs the compiled API. The scaffold does not include deployment wiring: a future deployment should serve the client and route `/api` to the server. The server binds to loopback for local development, and the Vite proxy expects port 3001; update `client/vite.config.ts` if you change the API port.

## Next steps

This initial scaffold intentionally leaves account registration/login, sessions, authenticated access, workout and goal editing, and deployment for later tasks. Add authenticated ownership checks before handling real user data or introducing write routes. The bcrypt helpers are building blocks, not an authentication system.

See [the starter backlog](docs/backlog.md) for small tasks to copy into Jira. The scaffold does not create an external Jira project or configure a CircleCI account connection.
