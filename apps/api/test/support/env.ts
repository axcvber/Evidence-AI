import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from '@evidence/shared';
import { z } from 'zod';
import { ApiEnv, apiEnvSchema } from '../../src/env.js';

// This app's own env file (apps/api/.env); CI provides the variables directly instead.
const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const testEnv = parseEnv(
  z.object({
    TEST_DATABASE_URL: postgresUrl,
    TEST_DATABASE_OWNER_URL: postgresUrl,
    TEST_AUTH_DATABASE_URL: postgresUrl,
  }),
  process.env,
);

export const TEST_WEB_ORIGIN = 'http://localhost:3000';

/** A complete API env for tests: real test databases, placeholders for services not used yet. */
export function testApiEnv(overrides: Partial<Record<string, string>> = {}): ApiEnv {
  return parseEnv(apiEnvSchema, {
    NODE_ENV: 'test',
    DATABASE_URL: testEnv.TEST_DATABASE_URL,
    AUTH_DATABASE_URL: testEnv.TEST_AUTH_DATABASE_URL,
    REDIS_URL: 'redis://localhost:6390',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    LANGFUSE_BASE_URL: 'http://localhost:3100',
    LANGFUSE_PUBLIC_KEY: 'pk-lf-test',
    LANGFUSE_SECRET_KEY: 'sk-lf-test',
    BETTER_AUTH_URL: TEST_WEB_ORIGIN,
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    EMAIL_FROM: 'Evidence AI <test@evidence.local>',
    ...overrides,
  });
}
