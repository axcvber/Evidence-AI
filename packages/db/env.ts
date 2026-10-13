import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from '@evidence/shared';
import { z } from 'zod';

// Tooling in this package (drizzle-kit, tests) runs from packages/db and reads the root .env.
// Deployed environments inject variables directly, so a missing file is fine.
const rootEnvFile = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export function loadMigrationEnv() {
  return parseEnv(z.object({ DATABASE_OWNER_URL: postgresUrl }), process.env);
}

export function loadTestEnv() {
  return parseEnv(
    z.object({ TEST_DATABASE_URL: postgresUrl, TEST_DATABASE_OWNER_URL: postgresUrl }),
    process.env,
  );
}
