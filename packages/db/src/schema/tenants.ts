import { sql } from 'drizzle-orm';
import { check, jsonb, numeric, pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns.js';
import { appRole, authFullAccessPolicy, currentUserId, tenantIsolationPolicy } from './rls.js';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    logo: text(),
    // Better Auth's organization metadata (JSON string). App settings live in `settings`.
    metadata: text(),
    plan: text().notNull().default('free'),
    settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    monthlyCostLimitUsd: numeric({ precision: 12, scale: 2 }).notNull().default('50'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('tenants_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    tenantIsolationPolicy(t.id),
    // Lets the workspace switcher list the user's workspaces before a tenant is chosen.
    pgPolicy('member_can_read', {
      for: 'select',
      to: appRole,
      using: sql`exists (select 1 from public.memberships m where m.tenant_id = ${t.id} and m.user_id = ${currentUserId})`,
    }),
    authFullAccessPolicy(),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
