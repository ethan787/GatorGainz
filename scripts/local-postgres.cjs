const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const action = process.argv[2];
if (!['start', 'stop', 'status'].includes(action)) {
  console.error('Usage: node scripts/local-postgres.cjs start|stop|status');
  process.exit(1);
}

const directory = path.resolve(__dirname, '../.local/postgresql');
const executable = path.join(directory, 'runtime/pgsql/bin/pg_ctl.exe');
const dataDirectory = path.join(directory, 'data');
if (
  process.platform !== 'win32' ||
  !existsSync(executable) ||
  !existsSync(path.join(dataDirectory, 'PG_VERSION'))
) {
  console.error(
    'The optional native Windows PostgreSQL instance is not initialized. See docs/authentication.md, or use docker compose up -d db.',
  );
  process.exit(1);
}

const state = spawnSync(executable, ['-D', dataDirectory, 'status'], {
  encoding: 'utf8',
  windowsHide: true,
});
if (state.error) throw state.error;
if (
  action === 'status' ||
  (action === 'start' && state.status === 0) ||
  (action === 'stop' && state.status === 3)
) {
  console.log(state.stdout.trim() || state.stderr.trim());
  process.exit(action === 'status' ? (state.status ?? 1) : 0);
}
if (state.status !== 0 && state.status !== 3) {
  console.error(state.stderr.trim() || 'Unable to check the local PostgreSQL instance.');
  process.exit(state.status ?? 1);
}

const pgArguments = ['-D', dataDirectory, '-w'];
if (action === 'start') {
  pgArguments.push(
    '-l',
    path.join(directory, 'postgres.log'),
    '-o',
    '-h 127.0.0.1 -p 5432',
    'start',
  );
} else {
  pgArguments.push('-m', 'fast', 'stop');
}
const result = spawnSync(executable, pgArguments, { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
