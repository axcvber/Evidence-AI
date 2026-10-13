import { SQL, sql } from 'drizzle-orm';
import { AnyPgColumn, pgPolicy, pgRole } from 'drizzle-orm/pg-core';

/** The role the API and worker connect as. Created outside migrations (init script / RDS bootstrap). */
export const appRole = pgRole('evidence_app').existing();

// Transaction-local settings written by the tenant-context helper (step 1.4).
// Unset gives NULL and an ended transaction leaves '', which NULLIF also turns into NULL,
// so a missing context matches no rows (fail closed). The sub-select makes Postgres evaluate
// it once per statement instead of once per row.
export const currentTenantId = sql`(select nullif(current_setting('app.tenant_id', true), '')::uuid)`;
export const currentUserId = sql`(select nullif(current_setting('app.user_id', true), '')::uuid)`;

/** Rows are visible and writable only inside the current tenant. */
export function tenantIsolationPolicy(tenantColumn: AnyPgColumn) {
  const sameTenant: SQL = sql`${tenantColumn} = ${currentTenantId}`;
  return pgPolicy('tenant_isolation', {
    for: 'all',
    to: appRole,
    using: sameTenant,
    withCheck: sameTenant,
  });
}
