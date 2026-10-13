import { loadTestEnv } from '../env.js';
import { migrateDatabase } from '../src/migrate.js';

/** Brings evidence_test up to the latest migration, as the owner role, before any test file runs. */
export default async function setup(): Promise<void> {
  await migrateDatabase(loadTestEnv().TEST_DATABASE_OWNER_URL);
}
