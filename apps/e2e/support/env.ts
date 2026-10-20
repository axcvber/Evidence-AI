import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

// Settings shared by prepare.ts, playwright.config.ts and the tests. The e2e run uses its own
// ports, the integration-test database and a separate Redis key space, so it never touches
// the dev servers (3000/4000) or the dev database.

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const API_DIR = path.join(ROOT, 'apps/api');
export const WEB_DIR = path.join(ROOT, 'apps/web');
export const OUTBOX_DIR = path.join(ROOT, 'apps/e2e/.outbox');

export const WEB_PORT = 3200;
export const API_PORT = 4200;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

// Locally the TEST_* URLs come from apps/api/.env (CI sets them directly). The file is
// parsed, not loaded into process.env: its NODE_ENV=development must not leak into the web
// build or the test runner.
const apiEnvFile = path.join(API_DIR, '.env');
const fileEnv = existsSync(apiEnvFile) ? parseEnv(readFileSync(apiEnvFile, 'utf8')) : {};

function setting(name: string): string | undefined {
  return process.env[name] ?? fileEnv[name];
}

function required(name: string): string {
  const value = setting(name);
  if (!value) throw new Error(`${name} must be set (apps/api/.env or the environment)`);
  return value;
}

/** The seeded dev accounts' password (DEV_SEED_PASSWORD overrides it, as for the seed). */
export const SEED_PASSWORD = setting('DEV_SEED_PASSWORD') ?? 'evidence-dev-password';

/**
 * Overrides for the API under test. The rest (secret, S3, Langfuse, EMAIL_FROM) comes from
 * apps/api/.env locally or from the environment in CI; explicit variables win over the file.
 */
export function apiEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    DATABASE_URL: required('TEST_DATABASE_URL'),
    AUTH_DATABASE_URL: required('TEST_AUTH_DATABASE_URL'),
    REDIS_URL: required('TEST_REDIS_URL'),
    AUTH_REDIS_KEY_PREFIX: 'evidence:e2e:',
    BETTER_AUTH_URL: WEB_URL,
    // Emails become JSON files the tests read; nothing is ever sent through Resend.
    EMAIL_TRANSPORT: 'outbox',
    EMAIL_OUTBOX_DIR: OUTBOX_DIR,
    AUTH_RATE_LIMIT_ENABLED: 'false',
    DEV_MOCKS_ENABLED: 'true',
    API_DOCS_ENABLED: 'false',
  };
}

export function testDatabaseOwnerUrl(): string {
  return required('TEST_DATABASE_OWNER_URL');
}
