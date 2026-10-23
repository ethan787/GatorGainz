# Registration and authentication implementation

This document explains the account implementation for code review. Account records and login sessions live in PostgreSQL. Workout drafts, completed-session summaries, pinned exercises, and themes remain browser-local; workout keys are scoped to the authenticated user's database ID.

## Request flow

1. The Figma form submits JSON to Express through Vite's existing `/api` proxy. Passwords travel in the request body and are never put in a URL or saved in browser storage.
2. Registration validates the name, email, and password. Email addresses are trimmed and lowercased. Names must fit the existing 80-character database column, and emails must fit 254 characters.
3. The API hashes the password with the existing bcrypt dependency at cost 12. bcrypt creates a random salt inside the resulting hash; no separate salt column is needed. Passwords require at least 15 Unicode characters and at most 72 UTF-8 bytes. They are never silently truncated.
4. The API inserts the user and a session in one PostgreSQL transaction. Duplicate email addresses return HTTP 409; the database unique index also resolves concurrent registration races.
5. A session token contains 32 cryptographically random bytes. Its SHA-256 digest is saved in PostgreSQL. The original token is sent only in the `gatorgainz_session` cookie, with `HttpOnly`, `SameSite=Lax`, `Path=/`, and a seven-day lifetime. Production cookies additionally use `Secure`.
6. Login loads the registered user, checks the password with bcrypt, and issues a new session. It revokes the session cookie presented by that browser when replacing it. Unknown emails, demo accounts without a password, and incorrect passwords receive the same HTTP 401 response; a dummy bcrypt comparison reduces timing differences for unknown accounts.
7. On reload the client calls `GET /api/auth/me`. The API hashes the cookie, checks the database session's expiry, and returns the user's public account fields. Failed service/network requests show a retry state rather than silently signing the user out.
8. Logout deletes the current database session and clears the cookie. The client updates its signed-in state only after the server confirms logout.

There are no JWTs, browser-stored authentication tokens, or signing secrets in this design. Session revocation takes effect immediately because each session lookup consults PostgreSQL.

```mermaid
sequenceDiagram
    participant Browser
    participant API as Express API
    participant DB as PostgreSQL
    Browser->>API: Register: name, email, password
    API->>API: Validate and bcrypt-hash password
    API->>DB: Transaction: insert user + session-token hash
    DB-->>API: Commit
    API-->>Browser: Public profile + HttpOnly session cookie
    Browser->>API: GET /api/auth/me with cookie
    API->>DB: Look up token hash and check expiry
    DB-->>API: User profile
    API-->>Browser: Signed-in user
    Browser->>API: POST /api/auth/logout
    API->>DB: Delete session
    API-->>Browser: Clear cookie
```

## Tables and migration

The existing `users` table stores `id`, `display_name`, `email`, `password_hash`, and `created_at`. API names map `display_name` to `fullName` and `created_at` to the ISO timestamp `joinedAt`. Responses never include the password hash.

`db/migrations/001_authentication.sql` adds:

| Database object            | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `users_email_lower_idx`    | Unique index on `lower(email)`; mixed-case duplicates are rejected at the database layer. |
| `auth_sessions.token_hash` | Primary key containing only the 64-character hexadecimal SHA-256 session digest.          |
| `auth_sessions.user_id`    | Foreign key to `users.id`; deleting a user deletes their sessions.                        |
| `auth_sessions.created_at` | Session creation time.                                                                    |
| `auth_sessions.expires_at` | Absolute expiry checked by every session lookup; must follow creation time.               |
| User and expiry indexes    | Support account-session lookups, cascading deletion, and removal of expired sessions.     |

`server/src/database/setup.ts` obtains one PostgreSQL connection, starts a transaction, takes an advisory lock, applies the bootstrap schema, and executes unapplied migrations in filename order. The `schema_migrations` table records each filename, SHA-256 checksum, and application time. Line endings are normalized before hashing so Windows and Linux checkouts agree. A changed applied migration fails; subsequent changes belong in a new migration. An error rolls back the setup transaction without deleting existing accounts.

`npm run db:setup` creates tables and applies migrations without inserting sample profiles. `npm run db:seed` additionally inserts the existing synthetic profiles; those have no password and cannot sign in. Setup can run again without duplicating rows or resetting passwords/sessions. If an existing database already has emails differing only by case, the unique-index migration fails for manual review instead of deleting or combining accounts.

Expired sessions are rejected immediately even if their rows still exist. They can be pruned periodically with:

```sql
DELETE FROM auth_sessions WHERE expires_at <= now();
```

## API contract

All account responses use `Cache-Control: no-store`. Errors have the shape `{ "error": "..." }`.

| Method and path           | Request                                      | Success                                                                        | Common failures                                            |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `POST /api/auth/register` | JSON fields: `fullName`, `email`, `password` | 201, `{ user }` with `id`, `fullName`, `email`, `joinedAt`, and session cookie | 400 invalid fields, 409 duplicate email, 429 throttled     |
| `POST /api/auth/login`    | JSON fields: `email`, `password`             | 200, same user response and new session cookie                                 | 400 invalid fields, 401 invalid credentials, 429 throttled |
| `GET /api/auth/me`        | Session cookie                               | 200, same user response                                                        | 401 missing, invalid, expired, or revoked session          |
| `POST /api/auth/logout`   | Session cookie if present                    | 204 and cookie removal                                                         | 403 rejected cross-origin request                          |

Every authentication POST requires `X-GatorGainz-Request: 1`. Register/login additionally require JSON content. The client sets these headers and sends same-origin credentials automatically. Present `Origin` headers must match the expected application origin. Ordinary cross-origin forms cannot supply the custom header, and the API does not grant cross-origin credentialed CORS access. Command-line API clients may omit `Origin`, but must still supply the custom header.

The development Vite proxy explicitly sets `changeOrigin: false` to preserve the browser's `Host` header for this check; Vite's string shorthand rewrites `Host` to the API address and would reject valid browser requests.

The default throttles are 10 failed login attempts per 15 minutes and 5 registration attempts per hour per client IP. Successful logins do not consume the login allowance. Counters are process-local; a deployment with multiple API processes needs a shared limiter store and a carefully configured trusted-proxy policy. Existing read-only fitness/demo endpoints retain their current public behavior; this change does not add authenticated workout write routes.

## Configuration and local review

Use the included local PostgreSQL 17 container:

```powershell
Copy-Item server/.env.example server/.env
docker compose up -d db
npm run db:setup
npm run dev
```

The copy command is for a fresh setup; preserve an existing `server/.env`. Its local `DATABASE_URL` matches `compose.yaml`. Open http://localhost:5173 and create an account. Credentials created by the former browser-only prototype are not imported; its old localStorage account records are removed by the client.

### Native Windows PostgreSQL when Docker cannot run

This machine reports unavailable virtualization, so Docker Desktop cannot start its Linux engine. For local development, PostgreSQL 17.11 was initialized from the [officially linked EDB Windows binary archive](https://www.postgresql.org/download/windows/). No Windows service, BIOS setting, or operating-system feature was changed.

The optional native instance uses these ignored paths:

- `.local/postgresql/runtime/pgsql/`: extracted PostgreSQL executables and support files.
- `.local/postgresql/data/`: durable database cluster, including accounts and sessions.
- `.local/postgresql/postgres.log`: server log.
- `server/.env`: local application connection settings, matching the development credentials in `compose.yaml`.

It listens only on `127.0.0.1:5432` and uses SCRAM-SHA-256 database connection authentication. The initialized cluster contains `gatorgainz` for the app and `gatorgainz_auth_test` for tests. The development role is an administrator of this local cluster; production should use a separate application role with limited permissions.

The runtime and database are already prepared on this machine. After a reboot, start the database before starting the application:

```powershell
npm run db:local:start
npm run dev
```

`npm run db:local:status` checks the instance. `npm run db:local:stop` shuts it down without deleting database files. Docker and the native instance cannot both bind port 5432; use one local database provider at a time. These native helper commands are optional and do not install PostgreSQL or change CI's Docker database setup.

For another Windows checkout, extract the EDB binary archive into `.local/postgresql/runtime/` so `pgsql/bin/initdb.exe` exists there, then initialize and create databases explicitly:

```powershell
& .\.local\postgresql\runtime\pgsql\bin\initdb.exe -D .local/postgresql/data -U gatorgainz -W --encoding=UTF8 --locale=C --auth-host=scram-sha-256 --auth-local=scram-sha-256
npm run db:local:start
& .\.local\postgresql\runtime\pgsql\bin\createdb.exe -h 127.0.0.1 -U gatorgainz -W gatorgainz
& .\.local\postgresql\runtime\pgsql\bin\createdb.exe -h 127.0.0.1 -U gatorgainz -W gatorgainz_auth_test
npm run db:setup
```

The `-W` prompts let you choose/enter the database password. Set `DATABASE_URL` in `server/.env` to that password; the checked-in example is a local development default. Do not reinitialize an existing data directory.

For production, use HTTPS, set `NODE_ENV=production`, and set `AUTH_ORIGIN` to the exact public HTTPS origin, such as `https://app.example.com`. The server rejects missing or invalid production origin configuration. Keep database credentials in the deployment environment. Do not enable broad credentialed CORS or trust forwarded headers from untrusted clients.

Without `DATABASE_URL`, the existing read-only demo API remains available, while account routes report an unavailable account service. A configured database failure never creates a browser-only or in-memory replacement account.

## Validation

`npm run check` typechecks both workspaces, runs Jest, and builds the client and API. Authentication route tests cover successful and rejected requests, cookie settings, session invalidation, validation, throttling, and origin/header protections.

`server/tests/auth-postgres.test.ts` exercises the actual SQL store and HTTP routes when `TEST_DATABASE_URL` is provided. It uses a randomly named schema inside a dedicated test database, and drops only that schema afterward. Tests cover database persistence across app instances, case-insensitive registration races, transaction rollback, stored password/token hashes, expiry, and logout revocation.

```powershell
# Use a dedicated test database, never production.
$env:TEST_DATABASE_URL = 'postgresql://gatorgainz:gatorgainz_local@127.0.0.1:5432/gatorgainz_auth_test'
npm run test:integration
```

CircleCI runs a PostgreSQL service and supplies a dedicated test connection, so the SQL tests run alongside the normal checks. Local Jest runs without `TEST_DATABASE_URL` explicitly skip the database integration suite.

Verified locally against PostgreSQL 17.11 for this change:

- `npm run check` with `TEST_DATABASE_URL` enabled: 46 tests passed, including all nine database integration tests; client/server typechecks and production builds passed.
- Eleven browser checks passed, including fresh-browser login, cookie properties, reload, duplicate registration, wrong-password handling, per-account browser data, revoked-cookie rejection, and retry states.
- Native database stop/start preserved all three synthetic browser-test accounts. The accounts were then deleted from the dedicated test database, and their sessions cascaded away. Integration schemas were also cleaned up.
- The application database is migrated and ready without synthetic accounts. The native database remains running; the temporary app servers were stopped.

## Deliberate limits

This implements account registration, password login, session restoration, and logout. Email verification, password reset/recovery, password changes, MFA, remote session management, and database-backed workout persistence require separate features. Registration's HTTP 409 response lets a caller determine that an email is registered; login uses a generic invalid-credentials response.

The old unscoped browser workout records are not imported into new accounts. They remain on the device, while newly registered accounts use separate keys based on their database IDs. Logout revokes the current browser session; other device sessions stay valid until they expire or are separately revoked.

The implementation keeps the repository's bcrypt helper. OWASP prefers Argon2id for new password-hashing systems, while documenting bcrypt's work factor and input-size requirements. The session and CSRF mechanisms follow the relevant OWASP guidance:

- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [node-postgres transaction API](https://node-postgres.com/features/transactions)
