import { createDb } from '@evidence/db';
import { Controller, Get, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDb } from '../src/tenancy/tenant-db.js';
import { createTestApp, TestApp } from './support/app.js';
import { Agent, createWorkspace, signUpVerified, uniqueEmail, uniqueSlug } from './support/auth.js';
import { testEnv } from './support/env.js';

const ROLLBACK_MARKER = 'api-rollback-probe';

@Controller('probe')
class ProbeController {
  constructor(private readonly tenantDb: TenantDb) {}

  /** Raw SQL without WHERE: only RLS stands between the handler and other tenants' rows. */
  @Get('groups')
  async groupTenants(): Promise<string[]> {
    // A random short sleep makes concurrent requests interleave inside their transactions.
    await this.tenantDb.tx.execute(sql`select pg_sleep(random() * 0.02)`);
    const result = await this.tenantDb.tx.execute<{ tenant_id: string }>(
      sql`select tenant_id from groups`,
    );
    return [...new Set(result.rows.map((row) => row.tenant_id))];
  }

  @Post('write-then-fail')
  async writeThenFail(): Promise<never> {
    await this.tenantDb.tx.execute(
      sql`insert into groups (tenant_id, name) values (current_setting('app.tenant_id')::uuid, ${ROLLBACK_MARKER})`,
    );
    throw new Error('handler failed after writing');
  }
}

const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });
let t: TestApp;
let alice: Agent;
let bob: Agent;
let noWorkspace: Agent;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  t = await createTestApp({ controllers: [ProbeController] });
  alice = await signUpVerified(t.server, t.emails, uniqueEmail('alice'));
  bob = await signUpVerified(t.server, t.emails, uniqueEmail('bob'));
  noWorkspace = await signUpVerified(t.server, t.emails, uniqueEmail('nows'));
  tenantA = await createWorkspace(alice, 'Isolation A', uniqueSlug('iso-a'));
  tenantB = await createWorkspace(bob, 'Isolation B', uniqueSlug('iso-b'));

  await owner.db.execute(sql`
    insert into groups (tenant_id, name) values
      (${tenantA}, 'Finance'), (${tenantA}, 'Legal'), (${tenantB}, 'Finance')
  `);
});

afterAll(async () => {
  await t.app.close();
  await owner.db.execute(sql`delete from tenants where id in (${tenantA}, ${tenantB})`);
  await owner.pool.end();
});

describe('tenant context per request', () => {
  it('tenant A cannot read tenant B rows with a raw query that omits WHERE tenant_id', async () => {
    const asA = await alice.get('/api/probe/groups').expect(200);
    const asB = await bob.get('/api/probe/groups').expect(200);

    expect(asA.body).toEqual([tenantA]);
    expect(asB.body).toEqual([tenantB]);
  });

  it('keeps tenants apart under concurrent, interleaved requests', async () => {
    const callers = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0 ? { agent: alice, tenant: tenantA } : { agent: bob, tenant: tenantB },
    );
    const responses = await Promise.all(callers.map(({ agent }) => agent.get('/api/probe/groups')));

    responses.forEach((response, i) => {
      expect(response.status).toBe(200);
      expect(response.body).toEqual([callers[i]?.tenant]);
    });
  });

  it('refuses tenant data access without an active workspace (fail closed)', async () => {
    const response = await noWorkspace.get('/api/probe/groups').expect(403);
    expect(response.body).toMatchObject({ code: 'NO_ACTIVE_WORKSPACE' });
  });

  it('rolls back the request transaction when the handler throws', async () => {
    await alice.post('/api/probe/write-then-fail').expect(500);

    const leftovers = await owner.db.execute(
      sql`select 1 from groups where name = ${ROLLBACK_MARKER}`,
    );
    expect(leftovers.rows).toHaveLength(0);
  });
});
