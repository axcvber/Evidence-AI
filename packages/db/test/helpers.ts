import pg from 'pg';
import { loadTestEnv } from '../env.js';

const env = loadTestEnv();

/** Owner connection: fixtures only. The owner is not subject to RLS. */
export const ownerPool = new pg.Pool({ connectionString: env.TEST_DATABASE_OWNER_URL, max: 2 });
/** Application connection: everything under test runs through this role. */
export const appPool = new pg.Pool({ connectionString: env.TEST_DATABASE_URL, max: 4 });

export interface AppContext {
  tenantId?: string;
  userId?: string;
}

/**
 * Runs `fn` as evidence_app in a transaction with the given context set the same way the
 * tenant-context helper will (transaction-local set_config), then rolls back so fixtures
 * stay untouched.
 */
export async function asApp<T>(
  context: AppContext,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query(
      "select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)",
      [context.tenantId ?? '', context.userId ?? ''],
    );
    return await fn(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

/** Postgres SQLSTATE codes the tests expect. */
export const PG = {
  insufficientPrivilege: '42501', // includes "new row violates row-level security policy"
  foreignKeyViolation: '23503',
} as const;
