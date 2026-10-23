# GatorGainz

GatorGainz combines the Figma-designed fitness interface with an Express REST API. The client includes account screens, workout logging, points, community views, and light/dark themes. It currently saves accounts and workout sessions in browser localStorage; connecting those flows to the API is future work. PostgreSQL is optional for running the app.

## Stack

| Area      | Technology                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Language  | TypeScript across client, server, and shared API contracts                 |
| Client    | React, Vite, Tailwind CSS 4, custom CSS                                    |
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

Open **http://localhost:5173**. The root command starts the Figma-designed client in `client/` and the API at **http://127.0.0.1:3001/api/health**. Vite proxies `/api` requests to Express, so no client environment file is needed. Stop both processes with **Ctrl+C**.

Choose **Create account** on the first screen to create a browser-local profile. Explore Overview, Log workout, Community, and Account. The interface supports exercise search, muscle-group filters, an interactive muscle map, pinned exercises, strength/cardio inputs, session drafts and history, and theme preferences. Some statistics, community entries, and controls remain sample data or placeholders.

The former standalone `figma-ui/` export has been consolidated into `client/`, replacing the original dashboard. There is one frontend, installed and checked through the root npm workspace commands; pnpm and the separate port 8443 preview are no longer needed. Browser storage is specific to the host and port, so profiles created in the old preview do not automatically appear at port 5173.

## Use PostgreSQL

1. Copy `server/.env.example` to `server/.env`.
2. Start a local database with `docker compose up -d db`, or use your own PostgreSQL instance.
3. Set `DATABASE_URL` in `server/.env`. For the included local database:

   ```dotenv
   DATABASE_URL=postgresql://gatorgainz:gatorgainz_local@localhost:5432/gatorgainz
   ```

4. Run `npm run db:setup` to apply `db/schema.sql` and `db/seed.sql`.
5. Start or restart `npm run dev`. Open **http://127.0.0.1:3001/api/health** and confirm `dataSource` is `postgres`.

Setup runs in a transaction and can be repeated without duplicating sample rows. Later schema changes should use versioned migrations. The local Docker credentials are development defaults. `docker compose stop` stops the database while preserving its volume.

With an empty `DATABASE_URL`, the API uses in-memory demo data. With a configured URL, it uses PostgreSQL and reports connection failures instead of falling back to demo data. The health endpoint checks database connectivity. This setting affects the API; the client currently keeps its own accounts and workout sessions in browser storage.

## Project layout

```text
client/
  src/App.tsx                    Figma-designed screens and browser-local state
  src/index.css                  Tailwind import, branding, themes, and responsive styles
  src/assets/gator-gainz-mark.png GatorGainz logo
  vite.config.ts                 React, Tailwind CSS, and API proxy
server/
  src/app.ts                     Express routes and error handling
  src/data/                      Demo and PostgreSQL data stores
  src/auth/passwords.ts          bcrypt hash/verify helpers
  scripts/setup-db.ts            Schema and sample-data setup
  tests/                         Jest API and password tests
shared/index.d.ts                API contracts used by the server
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

CircleCI runs `npm ci` and `npm run check` on commits using the lockfile. TypeScript checking and production builds include the Figma-designed client. Jest covers API responses, goal progress, rankings, error handling, and bcrypt password helpers. The logo is included directly in the client assets, so the app no longer requires a separate Git LFS download.

Run `npm run format` to format source and configuration files with Prettier.

Dependency audit note (October 8, 2026): Jest's development dependency chain includes `sprintf-js`, which has an [unpatched moderate advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). The high-severity findings were removed by updating Jest. This remaining finding affects development tooling rather than the app's runtime dependencies.

Build output goes to `client/dist` and `server/dist`. `npm run start --workspace server` runs the compiled API. The scaffold does not include deployment wiring: a future deployment should serve the client and route `/api` to the server. The server binds to loopback for local development, and the Vite proxy expects port 3001; update `client/vite.config.ts` if you change the API port.

## Next steps

Connect the client account screens and workout logger to server-side authentication, ownership checks, and persistent API write routes. Browser-local accounts currently use salted SHA-256 password hashes and workout storage uses shared browser keys; production authentication and account-scoped data remain future work. Goal management and deployment also remain open. The server's bcrypt helpers are building blocks for those account routes.

See [the starter backlog](docs/backlog.md) for small tasks to copy into Jira. The scaffold does not create an external Jira project or configure a CircleCI account connection.
