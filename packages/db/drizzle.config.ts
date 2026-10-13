import { defineConfig } from 'drizzle-kit';
import { loadMigrationEnv } from './env.js';

// Migrations run as evidence_owner, never as the app role.
const env = loadMigrationEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  dbCredentials: { url: env.DATABASE_OWNER_URL },
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
