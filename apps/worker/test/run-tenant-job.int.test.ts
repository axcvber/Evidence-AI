import { createDb } from '@evidence/db';
import { tenantJobPayloadSchema } from '@evidence/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runTenantJob } from '../src/tenancy/run-tenant-job.js';
import { testEnv } from './support/env.js';

const tenantA = '00000000-0000-4000-8000-0000000003aa';
const tenantB = '00000000-0000-4000-8000-0000000003bb';

const reindexGroupJob = tenantJobPayloadSchema.extend({ groupName: z.string().min(1) });

const app = createDb(testEnv.TEST_DATABASE_URL, { max: 1 });
const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });

beforeAll(async () => {
  await owner.db.execute(sql`delete from tenants where id in (${tenantA}, ${tenantB})`);
  await owner.db.execute(sql`
    insert into tenants (id, name, slug) values
      (${tenantA}, 'Job A', 'job-a'), (${tenantB}, 'Job B', 'job-b')
  `);
  await owner.db.execute(sql`
    insert into groups (tenant_id, name) values (${tenantA}, 'Ops'), (${tenantB}, 'Ops')
  `);
});

afterAll(async () => {
  await owner.db.execute(sql`delete from tenants where id in (${tenantA}, ${tenantB})`);
  await Promise.all([app.pool.end(), owner.pool.end()]);
});

describe('runTenantJob', () => {
  it("scopes the job's raw queries to the tenant in its payload", async () => {
    const seen = await runTenantJob(
      app.db,
      reindexGroupJob,
      { tenantId: tenantA, groupName: 'Ops' },
      async (tx, payload) => {
        // Deliberately no tenant filter: RLS must do the scoping.
        const result = await tx.execute<{ tenant_id: string }>(
          sql`select tenant_id from groups where name = ${payload.groupName}`,
        );
        return result.rows.map((row) => row.tenant_id);
      },
    );
    expect(seen).toEqual([tenantA]);
  });

  it.each([
    ['missing tenantId', { groupName: 'Ops' }],
    ['malformed tenantId', { tenantId: 'tenant-b', groupName: 'Ops' }],
    ['missing job fields', { tenantId: tenantA }],
    ['not an object', 'tenant-a'],
  ])('rejects a payload with %s before running the handler', async (_label, payload) => {
    let ran = false;
    await expect(
      runTenantJob(app.db, reindexGroupJob, payload, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow();
    expect(ran).toBe(false);
  });

  it('rolls back the job transaction when the handler fails', async () => {
    await expect(
      runTenantJob(app.db, reindexGroupJob, { tenantId: tenantA, groupName: 'Ops' }, async (tx) => {
        await tx.execute(sql`delete from groups`);
        throw new Error('job failed');
      }),
    ).rejects.toThrow('job failed');

    const remaining = await owner.db.execute(
      sql`select tenant_id from groups where tenant_id in (${tenantA}, ${tenantB})`,
    );
    expect(remaining.rows).toHaveLength(2);
  });
});
