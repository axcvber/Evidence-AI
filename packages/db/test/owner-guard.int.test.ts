import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { authPool, ownerPool } from './helpers.js';

// Migration 0004: a workspace that exists always has at least one owner. Changes run as
// evidence_auth, the role Better Auth uses to manage memberships.

const CHECK_VIOLATION = '23514';
const created: { tenants: string[]; users: string[] } = { tenants: [], users: [] };

afterAll(async () => {
  // Deleting the workspaces first removes their memberships, so the users can go too.
  await ownerPool.query('delete from tenants where id = any($1)', [created.tenants]);
  await ownerPool.query('delete from users where id = any($1)', [created.users]);
  await Promise.all([ownerPool.end(), authPool.end()]);
});

/** A workspace with the given members; returns its ID and the user IDs in the same order. */
async function workspace(roles: string[]): Promise<{ tenantId: string; userIds: string[] }> {
  const tenantId = randomUUID();
  const userIds = roles.map(() => randomUUID());
  created.tenants.push(tenantId);
  created.users.push(...userIds);
  await ownerPool.query('insert into tenants (id, name, slug) values ($1, $2, $3)', [
    tenantId,
    'Guarded',
    `guarded-${tenantId.slice(0, 8)}`,
  ]);
  for (const [i, userId] of userIds.entries()) {
    await ownerPool.query('insert into users (id, name, email) values ($1, $2, $3)', [
      userId,
      `User ${i}`,
      `${userId}@guard.test`,
    ]);
    await ownerPool.query(
      'insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)',
      [tenantId, userId, roles[i]],
    );
  }
  return { tenantId, userIds };
}

async function owners(tenantId: string): Promise<number> {
  const result = await ownerPool.query<{ n: number }>(
    "select count(*)::int as n from memberships where tenant_id = $1 and role = 'owner'",
    [tenantId],
  );
  return result.rows[0]?.n ?? 0;
}

/** Runs statements as evidence_auth in one transaction and commits. */
async function inTransaction(statements: [string, unknown[]][]): Promise<void> {
  const client = await authPool.connect();
  try {
    await client.query('begin');
    for (const [text, values] of statements) await client.query(text, values);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const demote = (tenantId: string, userId: string): [string, unknown[]] => [
  "update memberships set role = 'admin' where tenant_id = $1 and user_id = $2",
  [tenantId, userId],
];
const promote = (tenantId: string, userId: string): [string, unknown[]] => [
  "update memberships set role = 'owner' where tenant_id = $1 and user_id = $2",
  [tenantId, userId],
];
const remove = (tenantId: string, userId: string): [string, unknown[]] => [
  'delete from memberships where tenant_id = $1 and user_id = $2',
  [tenantId, userId],
];

describe('every workspace keeps an owner', () => {
  it('refuses to demote or remove the last owner', async () => {
    const { tenantId, userIds } = await workspace(['owner', 'admin']);
    const [owner] = userIds as [string];

    await expect(inTransaction([demote(tenantId, owner)])).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    await expect(inTransaction([remove(tenantId, owner)])).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
    expect(await owners(tenantId)).toBe(1);
  });

  it('refuses to delete a user who is the last owner', async () => {
    const { tenantId, userIds } = await workspace(['owner']);
    await expect(
      inTransaction([['delete from users where id = $1', [userIds[0]]]]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    expect(await owners(tenantId)).toBe(1);
  });

  it('allows a transfer in either order within one transaction', async () => {
    const { tenantId, userIds } = await workspace(['owner', 'admin']);
    const [owner, admin] = userIds as [string, string];

    await inTransaction([demote(tenantId, owner), promote(tenantId, admin)]);
    expect(await owners(tenantId)).toBe(1);
  });

  it('allows removing one of two owners', async () => {
    const {
      tenantId,
      userIds: [first],
    } = await workspace(['owner', 'owner']);
    await inTransaction([remove(tenantId, first ?? '')]);
    expect(await owners(tenantId)).toBe(1);
  });

  it('allows deleting the whole workspace, members first, in one transaction', async () => {
    const { tenantId } = await workspace(['owner', 'viewer']);
    await inTransaction([
      ['delete from memberships where tenant_id = $1', [tenantId]],
      ['delete from tenants where id = $1', [tenantId]],
    ]);
    const left = await ownerPool.query('select 1 from tenants where id = $1', [tenantId]);
    expect(left.rowCount).toBe(0);
  });

  it('ignores changes that do not touch an owner', async () => {
    const { tenantId, userIds } = await workspace(['owner', 'editor']);
    await inTransaction([
      [
        "update memberships set role = 'viewer' where tenant_id = $1 and user_id = $2",
        [tenantId, userIds[1]],
      ],
    ]);
  });

  it('lets only one of two owners demoting each other at the same moment succeed', async () => {
    const { tenantId, userIds } = await workspace(['owner', 'owner']);
    const [a, b] = userIds as [string, string];
    const [first, second] = [await authPool.connect(), await authPool.connect()];
    const runCheckNow = 'set constraints memberships_workspace_has_owner immediate';
    try {
      // Both demotions happen before either commits, like two simultaneous requests.
      await first.query('begin');
      await second.query('begin');
      await first.query(...demote(tenantId, b));
      await second.query(...demote(tenantId, a));

      // Run both checks before either commits, so the outcome doesn't depend on timing. The
      // first check passes and holds the workspace lock, so the second must still be waiting
      // a moment later (without the lock it would pass at once, seeing `b` still an owner).
      // Once the first commits, the second sees that `b` is no longer an owner and fails.
      await first.query(runCheckNow);
      const secondCheck = second.query(runCheckNow).then(() => 'passed' as const);
      secondCheck.catch(() => undefined);
      const waiting = new Promise((resolve) => setTimeout(() => resolve('waiting'), 300));
      expect(await Promise.race([secondCheck, waiting])).toBe('waiting');

      await first.query('commit');
      await expect(secondCheck).rejects.toMatchObject({ code: CHECK_VIOLATION });
      expect(await owners(tenantId)).toBe(1);
    } finally {
      for (const client of [first, second]) {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
    }
  });
});
