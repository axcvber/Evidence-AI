import { sql } from 'drizzle-orm';
import { index, pgEnum, pgPolicy, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';
import { appRole, authFullAccessPolicy, currentUserId, tenantIsolationPolicy } from './rls.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'editor', 'viewer']);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Also the target of group_members' composite FK, which keeps groups single-tenant.
    unique('memberships_tenant_user_unique').on(t.tenantId, t.userId),
    index('memberships_user_id_idx').on(t.userId),
    tenantIsolationPolicy(t.tenantId),
    // Your own memberships across workspaces, for the workspace switcher.
    pgPolicy('own_memberships_read', {
      for: 'select',
      to: appRole,
      using: sql`${t.userId} = ${currentUserId}`,
    }),
    authFullAccessPolicy(),
  ],
);

export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
