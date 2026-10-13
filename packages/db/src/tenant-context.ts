import { TenantContext, tenantContextSchema } from '@evidence/shared';
import { sql } from 'drizzle-orm';
import { Database } from './client.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Runs `fn` in a transaction scoped to one tenant. RLS policies read the settings written
 * here; `set_config(..., true)` makes them transaction-local, so they vanish at commit or
 * rollback and can never leak to the next user of a pooled connection.
 */
export async function withTenantContext<T>(
  db: Database,
  context: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const { tenantId, userId } = tenantContextSchema.parse(context);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', ${userId ?? ''}, true)`,
    );
    return fn(tx);
  });
}
