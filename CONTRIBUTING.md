# Contributing

Create a branch from current `main` and open a pull request targeting `main`. Use Node.js
22 from `.nvmrc` and install locked dependencies with `npm ci` at the repository root.

Before requesting review, run:

```sh
npm run check:ci
```

This checks formatting, lint, TypeScript across all workspaces, backend/API tests with
real PostgreSQL, and production builds. It requires `TEST_DATABASE_URL` pointing at a
dedicated test database. See [the CI guide](docs/ci.md#run-the-same-checks-locally) for
PowerShell/POSIX commands and database setup.

For a quick check without PostgreSQL, use `npm run check`; database suites may be skipped
in that command. Run `npm run format` to fix formatting and review its diff. Individual
commands are `format:check`, `lint`, `typecheck`, `test:ci`, and `build`.

The PR's **CI quality gate** must pass on the latest revision before merging. Update the
branch if `main` changes. Workflow and required-check names must stay in sync. Resolve
failures before merging; urgent production incidents use only the documented
[administrator emergency process](docs/ci.md#emergency-merge-process).
