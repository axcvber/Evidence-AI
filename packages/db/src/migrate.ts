import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Resolves to packages/db/migrations from both src/ (tests) and dist/ (built package).
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// Arbitrary constant shared by every process that migrates this database.
const MIGRATION_LOCK_ID = 7_301_458_221;

/**
 * Applies pending migrations as the owner role. An advisory lock serialises concurrent
 * callers (parallel test suites, several containers starting at once).
 */
export async function migrateDatabase(ownerUrl: string, folder = migrationsFolder): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle({ client }), {
      migrationsFolder: folder,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}
