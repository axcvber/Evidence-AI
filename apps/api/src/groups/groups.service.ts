import { groupMembers, groups, memberships, users } from '@evidence/db';
import type { Group, GroupMember } from '@evidence/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { decodeCursor, toPage } from '../common/cursor.js';
import { TenantDb } from '../tenancy/tenant-db.js';
import {
  GroupMemberNotFoundError,
  GroupNameTakenError,
  GroupNotFoundError,
  NotWorkspaceMemberError,
} from './group.errors.js';

const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps driver errors; the Postgres code is on the error or its cause. */
function pgErrorCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

const groupColumns = {
  id: groups.id,
  name: groups.name,
  description: groups.description,
  createdAt: groups.createdAt,
  updatedAt: groups.updatedAt,
  memberCount: sql<number>`(select count(*)::int from ${groupMembers} where ${groupMembers.groupId} = ${groups.id})`,
};

const memberColumns = {
  userId: groupMembers.userId,
  name: users.name,
  email: users.email,
  addedAt: groupMembers.createdAt,
};

type GroupRow = Omit<Group, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date };
type MemberRow = Omit<GroupMember, 'addedAt'> & { addedAt: Date };

const toGroup = (row: GroupRow): Group => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toMember = (row: MemberRow): GroupMember => ({ ...row, addedAt: row.addedAt.toISOString() });

/**
 * Groups of the active workspace. Every query runs in the request's tenant transaction, so RLS
 * limits it to that workspace: an ID from another workspace simply isn't found.
 */
@Injectable()
export class GroupsService {
  constructor(private readonly tenantDb: TenantDb) {}

  async list(
    limit: number,
    cursor?: string,
  ): Promise<{ items: Group[]; nextCursor: string | null }> {
    const after = cursor ? decodeCursor(cursor, 1)[0] : undefined;
    const rows = await this.tenantDb.tx
      .select(groupColumns)
      .from(groups)
      .where(after === undefined ? undefined : gt(groups.name, after))
      .orderBy(asc(groups.name))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => [row.name]);
    return { items: page.items.map(toGroup), nextCursor: page.nextCursor };
  }

  async get(groupId: string): Promise<Group> {
    const [row] = await this.tenantDb.tx
      .select(groupColumns)
      .from(groups)
      .where(eq(groups.id, groupId));
    if (!row) throw new GroupNotFoundError();
    return toGroup(row);
  }

  async create(tenantId: string, input: { name: string; description?: string }): Promise<Group> {
    const [created] = await this.uniqueName(() =>
      this.tenantDb.tx
        .insert(groups)
        .values({ tenantId, name: input.name, description: input.description ?? null })
        .returning({ id: groups.id }),
    );
    if (!created) throw new GroupNotFoundError();
    return this.get(created.id);
  }

  async update(
    groupId: string,
    input: { name?: string | undefined; description?: string | null | undefined },
  ): Promise<Group> {
    const [updated] = await this.uniqueName(() =>
      this.tenantDb.tx
        .update(groups)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(groups.id, groupId))
        .returning({ id: groups.id }),
    );
    if (!updated) throw new GroupNotFoundError();
    return this.get(updated.id);
  }

  async delete(groupId: string): Promise<void> {
    const deleted = await this.tenantDb.tx
      .delete(groups)
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    if (deleted.length === 0) throw new GroupNotFoundError();
  }

  async listMembers(
    groupId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: GroupMember[]; nextCursor: string | null }> {
    await this.get(groupId);
    const after = cursor ? decodeCursor(cursor, 2) : undefined;
    const rows = await this.tenantDb.tx
      .select(memberColumns)
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          after ? sql`(${users.name}, ${users.id}) > (${after[0]}, ${after[1]}::uuid)` : undefined,
        ),
      )
      .orderBy(asc(users.name), asc(users.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => [row.name, row.userId]);
    return { items: page.items.map(toMember), nextCursor: page.nextCursor };
  }

  async addMember(tenantId: string, groupId: string, userId: string): Promise<GroupMember> {
    await this.get(groupId);
    const [membership] = await this.tenantDb.tx
      .select({ userId: memberships.userId })
      .from(memberships)
      // Explicit tenant filter: RLS also shows the caller their own memberships elsewhere.
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)));
    if (!membership) throw new NotWorkspaceMemberError();

    await this.tenantDb.tx
      .insert(groupMembers)
      .values({ tenantId, groupId, userId })
      .onConflictDoNothing();
    const [member] = await this.tenantDb.tx
      .select(memberColumns)
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    if (!member) throw new GroupMemberNotFoundError();
    return toMember(member);
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await this.get(groupId);
    const removed = await this.tenantDb.tx
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning({ userId: groupMembers.userId });
    if (removed.length === 0) throw new GroupMemberNotFoundError();
  }

  /** Group names are unique per workspace (a constraint, so concurrent requests are safe too). */
  private async uniqueName<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new GroupNameTakenError();
      throw error;
    }
  }
}
