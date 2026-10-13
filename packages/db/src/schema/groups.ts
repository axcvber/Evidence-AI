import { foreignKey, index, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns.js';
import { memberships } from './memberships.js';
import { tenantIsolationPolicy } from './rls.js';
import { tenants } from './tenants.js';

export const groups = pgTable(
  'groups',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    description: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('groups_tenant_name_unique').on(t.tenantId, t.name),
    unique('groups_tenant_id_unique').on(t.tenantId, t.id),
    tenantIsolationPolicy(t.tenantId),
  ],
);

// Both FKs include tenant_id, so a group can only contain members of its own tenant,
// whatever the application code does.
export const groupMembers = pgTable(
  'group_members',
  {
    tenantId: uuid().notNull(),
    groupId: uuid().notNull(),
    userId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    foreignKey({
      name: 'group_members_group_fk',
      columns: [t.tenantId, t.groupId],
      foreignColumns: [groups.tenantId, groups.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'group_members_membership_fk',
      columns: [t.tenantId, t.userId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }).onDelete('cascade'),
    index('group_members_tenant_user_idx').on(t.tenantId, t.userId),
    tenantIsolationPolicy(t.tenantId),
  ],
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
