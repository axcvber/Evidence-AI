import 'reflect-metadata';
import { Server } from 'node:http';
import { createDb } from '@evidence/db';
import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  Post,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { TenantDb } from '../src/tenancy/tenant-db.js';
import { TenantRequest } from '../src/tenancy/tenant-transaction.interceptor.js';
import { testEnv } from './support/env.js';

const tenantA = '00000000-0000-4000-8000-0000000002aa';
const tenantB = '00000000-0000-4000-8000-0000000002bb';
const ROLLBACK_MARKER = 'api-rollback-probe';

/** Stands in for the auth guard of step 1.5, which will set the context from the session. */
@Injectable()
class TestTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<TenantRequest & { headers: Record<string, string | undefined> }>();
    const tenantId = req.headers['x-test-tenant-id'];
    if (tenantId !== undefined) req.tenantContext = { tenantId };
    return true;
  }
}

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
let app: INestApplication<Server>;

function probe(tenantId?: string) {
  const req = request(app.getHttpServer()).get('/probe/groups');
  return tenantId === undefined ? req : req.set('x-test-tenant-id', tenantId);
}

beforeAll(async () => {
  await owner.db.execute(sql`delete from tenants where id in (${tenantA}, ${tenantB})`);
  await owner.db.execute(sql`
    insert into tenants (id, name, slug) values
      (${tenantA}, 'Api A', 'api-a'), (${tenantB}, 'Api B', 'api-b')
  `);
  await owner.db.execute(sql`
    insert into groups (tenant_id, name) values
      (${tenantA}, 'Finance'), (${tenantA}, 'Legal'), (${tenantB}, 'Finance')
  `);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ databaseUrl: testEnv.TEST_DATABASE_URL })],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: TestTenantGuard }],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0);
});

afterAll(async () => {
  await app.close();
  await owner.db.execute(sql`delete from tenants where id in (${tenantA}, ${tenantB})`);
  await owner.pool.end();
});

describe('tenant context per request', () => {
  it('tenant A cannot read tenant B rows with a raw query that omits WHERE tenant_id', async () => {
    const asA = await probe(tenantA).expect(200);
    const asB = await probe(tenantB).expect(200);

    expect(asA.body).toEqual([tenantA]);
    expect(asB.body).toEqual([tenantB]);
  });

  it('keeps tenants apart under concurrent, interleaved requests', async () => {
    const tenants = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? tenantA : tenantB));
    const responses = await Promise.all(tenants.map((tenantId) => probe(tenantId)));

    responses.forEach((response, i) => {
      expect(response.status).toBe(200);
      expect(response.body).toEqual([tenants[i]]);
    });
  });

  it('refuses database access when no tenant context is set (fail closed)', async () => {
    const response = await probe().expect(500);

    expect(JSON.stringify(response.body)).not.toContain(tenantA);
    expect(JSON.stringify(response.body)).not.toContain(tenantB);
  });

  it('rejects a malformed tenant id before running the handler', async () => {
    await probe("' or 1=1 --").expect(500);
  });

  it('rolls back the request transaction when the handler throws', async () => {
    await request(app.getHttpServer())
      .post('/probe/write-then-fail')
      .set('x-test-tenant-id', tenantA)
      .expect(500);

    const leftovers = await owner.db.execute(
      sql`select 1 from groups where name = ${ROLLBACK_MARKER}`,
    );
    expect(leftovers.rows).toHaveLength(0);
  });
});
