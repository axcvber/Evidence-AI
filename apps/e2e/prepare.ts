// Runs before `playwright test` (see package.json): builds the API and web app for the e2e
// ports, brings the test database up to date, seeds the dev accounts and empties the outbox.
// Playwright then only starts the built servers.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  API_DIR,
  API_URL,
  apiEnv,
  OUTBOX_DIR,
  ROOT,
  testDatabaseOwnerUrl,
  WEB_DIR,
} from './support/env.ts';

/**
 * apps/web/.env.local points the proxy at the dev API. If it won over API_URL, the tests would
 * drive the dev API, which sends real email, so stop here instead.
 */
function assertProxyTarget() {
  const manifest = JSON.parse(
    readFileSync(path.join(WEB_DIR, '.next/routes-manifest.json'), 'utf8'),
  ) as { rewrites: { destination: string }[] | Record<string, { destination: string }[]> };
  const rewrites = Array.isArray(manifest.rewrites)
    ? manifest.rewrites
    : Object.values(manifest.rewrites).flat();
  const targets = rewrites.map((rewrite) => rewrite.destination);
  if (!targets.every((target) => target.startsWith(`${API_URL}/`))) {
    throw new Error(`The web build proxies to ${targets.join(', ')}, not ${API_URL}`);
  }
}

function run(command: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

// The API and the packages it imports.
run('pnpm', ['turbo', 'run', 'build', '--filter=@evidence/api'], ROOT);
// Built directly (not through turbo's cache): the /api proxy target is fixed at build time.
run('pnpm', ['exec', 'next', 'build'], WEB_DIR, { API_URL });
assertProxyTarget();

const { migrateDatabase } = await import('@evidence/db');
await migrateDatabase(testDatabaseOwnerUrl());
console.log('\n> test database migrated');

run('node', ['--env-file-if-exists=.env', 'dist/scripts/seed-dev.js'], API_DIR, apiEnv());

rmSync(OUTBOX_DIR, { recursive: true, force: true });
console.log('> outbox emptied');
