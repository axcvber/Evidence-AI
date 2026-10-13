import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from '@evidence/shared';
import { z } from 'zod';

// This app's own env file (apps/<app>/.env); CI provides the variables directly instead.
const envFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const testEnv = parseEnv(
  z.object({ TEST_DATABASE_URL: postgresUrl, TEST_DATABASE_OWNER_URL: postgresUrl }),
  process.env,
);
