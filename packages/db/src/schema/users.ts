import { sql } from 'drizzle-orm';
import { boolean, check, pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns.js';
import { appRole, authFullAccessPolicy, currentTenantId, currentUserId } from './rls.js';

// Users are global (one account, many workspaces), so there is no tenant_id. Visibility is
// limited to yourself and members of the current tenant. The app role cannot insert or
// delete users; that is Better Auth's job, through the auth role.
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    pgPolicy('self_or_same_tenant_read', {
      for: 'select',
      to: appRole,
      using: sql`${t.id} = ${currentUserId} or exists (select 1 from public.memberships m where m.user_id = ${t.id} and m.tenant_id = ${currentTenantId})`,
    }),
    pgPolicy('self_update', {
      for: 'update',
      to: appRole,
      using: sql`${t.id} = ${currentUserId}`,
      withCheck: sql`${t.id} = ${currentUserId}`,
    }),
    authFullAccessPolicy(),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
