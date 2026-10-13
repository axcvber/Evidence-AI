import { sql } from 'drizzle-orm';
import { bigint, index, inet, jsonb, pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';
import { appRole, currentTenantId } from './rls.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

// Append-only: the app role gets SELECT and INSERT policies here, and UPDATE/DELETE
// privileges are revoked in migration 0001.
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: inet(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    pgPolicy('tenant_read', {
      for: 'select',
      to: appRole,
      using: sql`${t.tenantId} = ${currentTenantId}`,
    }),
    pgPolicy('tenant_append', {
      for: 'insert',
      to: appRole,
      withCheck: sql`${t.tenantId} = ${currentTenantId}`,
    }),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
