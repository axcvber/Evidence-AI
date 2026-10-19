import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appPool, asApp, authPool, ownerPool, PG } from './helpers.js';

// Fixed ids keep failures readable.
const tenantA = '00000000-0000-4000-8000-00000000000a';
const tenantB = '00000000-0000-4000-8000-00000000000b';
const alice = '00000000-0000-4000-8000-0000000a11ce'; // owner of A
const bob = '00000000-0000-4000-8000-000000000b0b'; // owner of B
const carol = '00000000-0000-4000-8000-0000000ca201'; // member of A and B
const groupA = '00000000-0000-4000-8000-0000000064a0';
const groupB = '00000000-0000-4000-8000-0000000064b0';

const tenantTables = [
  'memberships',
  'groups',
  'group_members',
  'audit_log',
  'invitations',
] as const;

beforeAll(async () => {
  // Other packages' suites share evidence_test, so only this file's fixtures are reset.
  // Deleting tenants and users cascades to everything that references them.
  await ownerPool.query('delete from tenants where id = any($1)', [[tenantA, tenantB]]);
  await ownerPool.query('delete from users where id = any($1)', [[alice, bob, carol]]);
  await ownerPool.query(`
    insert into tenants (id, name, slug) values
      ('${tenantA}', 'Tenant A', 'tenant-a'),
      ('${tenantB}', 'Tenant B', 'tenant-b');
    insert into users (id, name, email) values
      ('${alice}', 'Alice', 'alice@a.test'),
      ('${bob}', 'Bob', 'bob@b.test'),
      ('${carol}', 'Carol', 'carol@ab.test');
    insert into memberships (tenant_id, user_id, role) values
      ('${tenantA}', '${alice}', 'owner'),
      ('${tenantA}', '${carol}', 'viewer'),
      ('${tenantB}', '${bob}', 'owner'),
      ('${tenantB}', '${carol}', 'editor');
    insert into groups (id, tenant_id, name) values
      ('${groupA}', '${tenantA}', 'HR'),
      ('${groupB}', '${tenantB}', 'HR');
    insert into group_members (tenant_id, group_id, user_id) values
      ('${tenantA}', '${groupA}', '${alice}'),
      ('${tenantB}', '${groupB}', '${bob}');
    insert into audit_log (tenant_id, actor_user_id, action, target_type) values
      ('${tenantA}', '${alice}', 'group.created', 'group'),
      ('${tenantB}', '${bob}', 'group.created', 'group');
    insert into invitations (tenant_id, email, role, inviter_id, expires_at) values
      ('${tenantA}', 'new-a@a.test', 'viewer', '${alice}', now() + interval '7 days'),
      ('${tenantB}', 'new-b@b.test', 'editor', '${bob}', now() + interval '7 days');
  `);
});

afterAll(async () => {
  await Promise.all([ownerPool.end(), appPool.end(), authPool.end()]);
});

async function tenantIdsIn(table: string, context: Parameters<typeof asApp>[0]) {
  return asApp(context, async (client) => {
    // Deliberately no WHERE clause: RLS alone must scope the result.
    const { rows } = await client.query<{ tenant_id: string }>(`select tenant_id from ${table}`);
    return rows.map((row) => row.tenant_id);
  });
}

describe('fail closed without tenant context', () => {
  it.each([...tenantTables, 'tenants', 'users'])('%s returns no rows', async (table) => {
    const count = await asApp({}, async (client) => {
      const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from ${table}`);
      return rows[0]?.n;
    });
    expect(count).toBe(0);
  });

  it("treats the '' left behind by an ended transaction as no tenant", async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query('commit');

      const setting = await client.query<{ v: string }>(
        "select current_setting('app.tenant_id', true) as v",
      );
      expect(setting.rows[0]?.v).toBe('');
      const { rows } = await client.query('select * from groups');
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});

describe('tenant isolation', () => {
  it.each(tenantTables)('%s only returns rows of the current tenant', async (table) => {
    const seenByA = await tenantIdsIn(table, { tenantId: tenantA });
    const seenByB = await tenantIdsIn(table, { tenantId: tenantB });

    expect(seenByA.length).toBeGreaterThan(0);
    expect(new Set(seenByA)).toEqual(new Set([tenantA]));
    expect(new Set(seenByB)).toEqual(new Set([tenantB]));
  });

  it('tenants only exposes the current tenant', async () => {
    const ids = await asApp({ tenantId: tenantA }, async (client) => {
      const { rows } = await client.query<{ id: string }>('select id from tenants');
      return rows.map((row) => row.id);
    });
    expect(ids).toEqual([tenantA]);
  });

  it('rejects inserting a row for another tenant', async () => {
    await expect(
      asApp({ tenantId: tenantA }, (client) =>
        client.query('insert into groups (tenant_id, name) values ($1, $2)', [tenantB, 'Sneaky']),
      ),
    ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
  });

  it('rejects moving a row into another tenant', async () => {
    await expect(
      asApp({ tenantId: tenantA }, (client) =>
        client.query('update groups set tenant_id = $1 where id = $2', [tenantB, groupA]),
      ),
    ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
  });

  it("cannot update or delete another tenant's rows (they are invisible)", async () => {
    const affected = await asApp({ tenantId: tenantA }, async (client) => {
      const updated = await client.query("update groups set name = 'Owned' where id = $1", [
        groupB,
      ]);
      const deleted = await client.query('delete from groups where id = $1', [groupB]);
      return [updated.rowCount, deleted.rowCount];
    });
    expect(affected).toEqual([0, 0]);
  });

  it("rejects adding another tenant's user to a group", async () => {
    // bob belongs only to tenant B; the composite FK requires a membership in tenant A.
    await expect(
      asApp({ tenantId: tenantA }, (client) =>
        client.query(
          'insert into group_members (tenant_id, group_id, user_id) values ($1, $2, $3)',
          [tenantA, groupA, bob],
        ),
      ),
    ).rejects.toMatchObject({ code: PG.foreignKeyViolation });
  });

  it('allows creating a workspace by setting the new tenant id first', async () => {
    const newTenant = '00000000-0000-4000-8000-0000000000cc';
    const created = await asApp({ tenantId: newTenant }, async (client) => {
      await client.query("insert into tenants (id, name, slug) values ($1, 'New', 'new-ws')", [
        newTenant,
      ]);
      const { rows } = await client.query<{ id: string }>('select id from tenants');
      return rows;
    });
    expect(created).toEqual([{ id: newTenant }]);
  });
});

describe('audit_log is append-only', () => {
  it('allows inserting for the current tenant', async () => {
    const inserted = await asApp({ tenantId: tenantA }, async (client) => {
      const { rowCount } = await client.query(
        "insert into audit_log (tenant_id, action, target_type) values ($1, 'test', 'test')",
        [tenantA],
      );
      return rowCount;
    });
    expect(inserted).toBe(1);
  });

  it.each([["update audit_log set action = 'tampered'"], ['delete from audit_log']])(
    'denies: %s',
    async (statement) => {
      await expect(
        asApp({ tenantId: tenantA }, (client) => client.query(statement)),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
    },
  );
});

describe('users', () => {
  async function visibleUsers(context: Parameters<typeof asApp>[0]) {
    return asApp(context, async (client) => {
      const { rows } = await client.query<{ id: string }>('select id from users order by id');
      return rows.map((row) => row.id).sort();
    });
  }

  it('shows yourself and members of the current tenant only', async () => {
    expect(await visibleUsers({ tenantId: tenantA, userId: alice })).toEqual([alice, carol].sort());
    expect(await visibleUsers({ tenantId: tenantB, userId: bob })).not.toContain(alice);
  });

  it('cannot update another user', async () => {
    const rowCount = await asApp({ tenantId: tenantA, userId: alice }, async (client) => {
      const result = await client.query("update users set name = 'Hacked' where id = $1", [carol]);
      return result.rowCount;
    });
    expect(rowCount).toBe(0);
  });

  it('cannot create or delete users', async () => {
    await expect(
      asApp({ tenantId: tenantA, userId: alice }, (client) =>
        client.query("insert into users (name, email) values ('Eve', 'eve@x.test')"),
      ),
    ).rejects.toMatchObject({ code: PG.insufficientPrivilege });

    const deleted = await asApp({ tenantId: tenantA, userId: alice }, async (client) => {
      const result = await client.query('delete from users where id = $1', [alice]);
      return result.rowCount;
    });
    expect(deleted).toBe(0);
  });
});

describe('workspace switcher (user context, no tenant)', () => {
  it("lists only the user's own memberships and tenants", async () => {
    const { tenantIds, membershipUsers } = await asApp({ userId: carol }, async (client) => {
      const tenantsResult = await client.query<{ id: string }>('select id from tenants');
      const membershipsResult = await client.query<{ user_id: string }>(
        'select user_id from memberships',
      );
      return {
        tenantIds: tenantsResult.rows.map((row) => row.id).sort(),
        membershipUsers: new Set(membershipsResult.rows.map((row) => row.user_id)),
      };
    });

    expect(tenantIds).toEqual([tenantA, tenantB].sort());
    expect(membershipUsers).toEqual(new Set([carol]));
  });

  it('does not expose groups or audit entries without a tenant', async () => {
    expect(await tenantIdsIn('groups', { userId: carol })).toEqual([]);
    expect(await tenantIdsIn('audit_log', { userId: carol })).toEqual([]);
  });
});

describe('catalog guards', () => {
  // Tables in `public` that intentionally have no RLS. Keep empty unless there is a reason.
  const rlsExempt: string[] = [];

  it('every public table has RLS enabled and at least one policy', async () => {
    const { rows } = await ownerPool.query<{ table: string; rls: boolean; policies: number }>(`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    `);
    const unprotected = rows.filter(
      (row) => !rlsExempt.includes(row.table) && (!row.rls || row.policies === 0),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(unprotected).toEqual([]);
  });

  it('the app role cannot bypass RLS and owns nothing', async () => {
    const { rows } = await appPool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      owned: number;
    }>(`
      select r.rolsuper, r.rolbypassrls,
             (select count(*)::int from pg_class c where c.relowner = r.oid) as owned
      from pg_roles r where r.rolname = current_user
    `);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, owned: 0 });
  });

  it('the app role cannot change the schema', async () => {
    await expect(appPool.query('create table sneaky (id int)')).rejects.toMatchObject({
      code: PG.insufficientPrivilege,
    });
    await expect(
      appPool.query('alter table groups disable row level security'),
    ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
  });
});

describe('auth secrets are closed to the app role', () => {
  it.each(['sessions', 'accounts', 'verifications'])('denies any access to %s', async (table) => {
    await expect(
      asApp({ tenantId: tenantA, userId: alice }, (client) =>
        client.query(`select * from ${table}`),
      ),
    ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
  });
});

describe('the auth role (Better Auth) only reaches auth tables', () => {
  it.each(['groups', 'group_members', 'audit_log'])('denies reading %s', async (table) => {
    await expect(authPool.query(`select * from ${table}`)).rejects.toMatchObject({
      code: PG.insufficientPrivilege,
    });
  });

  it('denies writing tenant data', async () => {
    await expect(
      authPool.query('insert into groups (tenant_id, name) values ($1, $2)', [tenantA, 'Sneaky']),
    ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
  });

  it('has no table privileges beyond the auth tables', async () => {
    const { rows } = await authPool.query<{ table_name: string }>(`
      select distinct table_name from information_schema.table_privileges
      where grantee = 'evidence_auth' and table_schema = 'public'
      order by table_name
    `);
    expect(rows.map((row) => row.table_name)).toEqual([
      'accounts',
      'invitations',
      'memberships',
      'sessions',
      'tenants',
      'users',
      'verifications',
    ]);
  });

  it('can read across tenants on the auth tables (sign-in and workspace lists need it)', async () => {
    const { rows } = await authPool.query<{ tenant_id: string }>(
      'select distinct tenant_id from memberships where tenant_id = any($1)',
      [[tenantA, tenantB]],
    );
    expect(new Set(rows.map((row) => row.tenant_id))).toEqual(new Set([tenantA, tenantB]));
  });

  it('cannot bypass RLS or own anything', async () => {
    const { rows } = await authPool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      owned: number;
    }>(`
      select r.rolsuper, r.rolbypassrls,
             (select count(*)::int from pg_class c where c.relowner = r.oid) as owned
      from pg_roles r where r.rolname = current_user
    `);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, owned: 0 });
  });
});
