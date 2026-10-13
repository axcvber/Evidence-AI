import { Database, Transaction, withTenantContext } from '@evidence/db';
import { TenantJobPayload } from '@evidence/shared';
import { z } from 'zod';

/**
 * Runs a tenant-scoped job: validates the raw payload first (jobs come from Redis, so they
 * are an edge like any API request), then runs the handler in a transaction with
 * `app.tenant_id` set to the job's tenant. A payload without a valid tenant never reaches
 * the database.
 */
export async function runTenantJob<P extends TenantJobPayload, R>(
  db: Database,
  payloadSchema: z.ZodType<P>,
  rawPayload: unknown,
  handler: (tx: Transaction, payload: P) => Promise<R>,
): Promise<R> {
  const payload = payloadSchema.parse(rawPayload);
  return withTenantContext(db, { tenantId: payload.tenantId, userId: payload.actorUserId }, (tx) =>
    handler(tx, payload),
  );
}
