import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTestEnv } from '../env.js';
import { createDb } from '../src/client.js';
import { groups } from '../src/schema/index.js';
import { withTenantContext } from '../src/tenant-context.js';
import { ownerPool } from './helpers.js';

const tenantA = '00000000-0000-4000-8000-0000000001aa';
const tenantB = '00000000-0000-4000-8000-0000000001bb';

// One connection, so every call reuses it: proves nothing carries over between transactions.
const { db, pool } = createDb(loadTestEnv().TEST_DATABASE_URL, { max: 1 });

async function rawGroupTenants(tx: Parameters<Parameters<typeof withTenantContext>[2]>[0]) {
  // Deliberately no WHERE clause.
  const result = await tx.execute<{ tenant_id: string }>(sql`select tenant_id from groups`);
  return [...new Set(result.rows.map((row) => row.tenant_id))];
}

beforeAll(async () => {
  await ownerPool.query('delete from tenants where id = any($1)', [[tenantA, tenantB]]);
  await ownerPool.query(`
    insert into tenants (id, name, slug) values
      ('${tenantA}', 'Ctx A', 'ctx-a'), ('${tenantB}', 'Ctx B', 'ctx-b');
    insert into groups (tenant_id, name) values
      ('${tenantA}', 'Engineering'), ('${tenantB}', 'Engineering');
  `);
});

afterAll(async () => {
  await ownerPool.query('delete from tenants where id = any($1)', [[tenantA, tenantB]]);
  await Promise.all([pool.end(), ownerPool.end()]);
});

describe('withTenantContext', () => {
  it('scopes a raw query without WHERE to the given tenant', async () => {
    expect(await withTenantContext(db, { tenantId: tenantA }, rawGroupTenants)).toEqual([tenantA]);
    expect(await withTenantContext(db, { tenantId: tenantB }, rawGroupTenants)).toEqual([tenantB]);
  });

  it('leaves no context on the pooled connection afterwards', async () => {
    await withTenantContext(db, { tenantId: tenantA }, rawGroupTenants);

    const after = await db.execute<{ tenant: string; n: number }>(
      sql`select current_setting('app.tenant_id', true) as tenant, (select count(*)::int from groups) as n`,
    );
    expect(after.rows[0]).toEqual({ tenant: '', n: 0 });
  });

  it('rolls back everything when the callback throws', async () => {
    await expect(
      withTenantContext(db, { tenantId: tenantA }, async (tx) => {
        await tx.insert(groups).values({ tenantId: tenantA, name: 'Rolled back' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const names = await withTenantContext(db, { tenantId: tenantA }, (tx) =>
      tx.select({ name: groups.name }).from(groups),
    );
    expect(names).toEqual([{ name: 'Engineering' }]);
  });

  it.each([
    ['a non-uuid tenant id', { tenantId: "x' or '1'='1" }],
    ['an empty tenant id', { tenantId: '' }],
    ['a non-uuid user id', { tenantId: tenantA, userId: 'admin' }],
  ])('rejects %s before touching the database', async (_label, context) => {
    let ran = false;
    await expect(
      withTenantContext(db, context, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow();
    expect(ran).toBe(false);
  });
});
