import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';
import { membershipRole } from './memberships.js';
import { authFullAccessPolicy, tenantIsolationPolicy } from './rls.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    role: membershipRole().notNull().default('viewer'),
    status: text().notNull().default('pending'),
    inviterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'invitations_status_valid',
      sql`${t.status} in ('pending', 'accepted', 'rejected', 'canceled')`,
    ),
    index('invitations_tenant_id_idx').on(t.tenantId),
    index('invitations_email_idx').on(t.email),
    // The app role sees a workspace's invitations (members page); Better Auth manages them.
    tenantIsolationPolicy(t.tenantId),
    authFullAccessPolicy(),
  ],
);

export type Invitation = typeof invitations.$inferSelect;
