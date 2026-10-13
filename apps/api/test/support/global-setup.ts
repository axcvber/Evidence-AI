import { migrateDatabase } from '@evidence/db';
import { testEnv } from './env.js';

export default async function setup(): Promise<void> {
  await migrateDatabase(testEnv.TEST_DATABASE_OWNER_URL);
}
