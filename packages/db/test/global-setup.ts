import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadTestEnv } from '../env.js';

/** Brings evidence_test up to the latest migration, as the owner role, before any test file runs. */
export default async function setup(): Promise<void> {
  const env = loadTestEnv();
  const pool = new pg.Pool({ connectionString: env.TEST_DATABASE_OWNER_URL, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: path.resolve(import.meta.dirname, '../migrations'),
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await pool.end();
  }
}
