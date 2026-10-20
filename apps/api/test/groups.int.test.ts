import { createDb } from '@evidence/db';
import type { EndpointDefinition, Group, GroupMember, WorkspaceRole } from '@evidence/shared';
import { buildPath, can, groupEndpoints } from '@evidence/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import {
  Agent,
  createWorkspace,
  inviteAndJoin,
  JoinedMember,
  signUpVerified,
  uniqueEmail,
  uniqueSlug,
} from './support/auth.js';
import { testEnv } from './support/env.js';

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

let t: TestApp;
const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });
const roles: WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer'];
const members = {} as Record<WorkspaceRole, JoinedMember>;
let tenantId: string;

beforeAll(async () => {
  t = await createTestApp();
  const ownerEmail = uniqueEmail('owner');
  const ownerAgent = await signUpVerified(t.server, t.emails, ownerEmail, 'Olivia Owner');
  tenantId = await createWorkspace(ownerAgent, 'Groups', uniqueSlug('groups'));
  const meBody = (await ownerAgent.get('/api/me').expect(200)).body as { user: { id: string } };
  members.owner = { agent: ownerAgent, email: ownerEmail, userId: meBody.user.id };
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    members[role] = await inviteAndJoin(t.server, t.emails, ownerAgent, role);
  }
});

afterAll(async () => {
  await t.app.close();
  await owner.pool.end();
});

function call(
  agent: Agent,
  contract: EndpointDefinition,
  input: { params?: Record<string, string>; query?: object; body?: object } = {},
) {
  const url = `/api${buildPath(contract.path, input.params)}`;
  const method = contract.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const req = agent[method](url);
  if (input.query) void req.query(input.query);
  return input.body ? req.send(input.body) : req;
}

const admin = () => members.admin.agent;

async function createGroup(name = `Group ${crypto.randomUUID().slice(0, 8)}`, agent = admin()) {
  const res = await call(agent, groupEndpoints.create, { body: { name } }).expect(201);
  return res.body as Group;
}

describe('groups: create, read, update, delete', () => {
  it('creates, renames and deletes a group, keeping the members in the workspace', async () => {
    const group = await createGroup('  Legal team ');
    expect(group).toMatchObject({ name: 'Legal team', description: null, memberCount: 0 });
    expect(Object.keys(group).sort()).toEqual(
      ['createdAt', 'description', 'id', 'memberCount', 'name', 'updatedAt'].sort(),
    );

    await call(admin(), groupEndpoints.addMember, {
      params: { groupId: group.id, userId: members.viewer.userId },
    }).expect(200);
    const updated = await call(admin(), groupEndpoints.update, {
      params: { groupId: group.id },
      body: { name: 'Legal', description: 'Contracts and compliance' },
    }).expect(200);
    expect(updated.body).toMatchObject({
      name: 'Legal',
      description: 'Contracts and compliance',
      memberCount: 1,
    });

    await call(admin(), groupEndpoints.delete, { params: { groupId: group.id } }).expect(200);
    await call(admin(), groupEndpoints.get, { params: { groupId: group.id } }).expect(404);
    await members.viewer.agent.get('/api/me').expect(200);
  });

  it('refuses a duplicate name, on create and on rename', async () => {
    const first = await createGroup();
    const second = await createGroup();
    const dup = await call(admin(), groupEndpoints.create, { body: { name: first.name } }).expect(
      409,
    );
    expect(dup.body).toMatchObject({ code: 'GROUP_NAME_TAKEN' });
    await call(admin(), groupEndpoints.update, {
      params: { groupId: second.id },
      body: { name: first.name },
    }).expect(409);
  });

  it.each([
    ['a blank name', groupEndpoints.create, {}, { name: '   ' }],
    ['a name over 80 characters', groupEndpoints.create, {}, { name: 'x'.repeat(81) }],
    ['an empty update', groupEndpoints.update, { groupId: crypto.randomUUID() }, {}],
  ] as const)('rejects %s', async (_, contract, params, body) => {
    const res = await call(admin(), contract, { params, body }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a malformed group ID', async () => {
    await admin().get('/api/groups/not-a-uuid').expect(400);
  });
});

describe('group members', () => {
  it('adds a member once, lists them, and removes them', async () => {
    const group = await createGroup();
    const params = { groupId: group.id, userId: members.editor.userId };

    const added = await call(admin(), groupEndpoints.addMember, { params }).expect(200);
    expect(added.body).toMatchObject({
      userId: members.editor.userId,
      email: members.editor.email,
    });
    await call(admin(), groupEndpoints.addMember, { params }).expect(200);

    const list = await call(members.viewer.agent, groupEndpoints.listMembers, {
      params: { groupId: group.id },
    }).expect(200);
    expect((list.body as Page<GroupMember>).items.map((m) => m.userId)).toEqual([
      members.editor.userId,
    ]);

    await call(admin(), groupEndpoints.removeMember, { params }).expect(200);
    const again = await call(admin(), groupEndpoints.removeMember, { params }).expect(404);
    expect(again.body).toMatchObject({ code: 'GROUP_MEMBER_NOT_FOUND' });
  });

  it('only accepts members of this workspace', async () => {
    const group = await createGroup();
    const outsider = await signUpVerified(t.server, t.emails, uniqueEmail('outsider'));
    await createWorkspace(outsider, 'Elsewhere', uniqueSlug('elsewhere'));
    const outsiderId = (
      (await outsider.get('/api/me').expect(200)).body as { user: { id: string } }
    ).user.id;

    const res = await call(admin(), groupEndpoints.addMember, {
      params: { groupId: group.id, userId: outsiderId },
    }).expect(400);
    expect(res.body).toMatchObject({ code: 'NOT_A_WORKSPACE_MEMBER' });
  });

  it('drops someone from every group when they leave the workspace', async () => {
    const group = await createGroup();
    const leaver = await inviteAndJoin(t.server, t.emails, members.owner.agent, 'viewer');
    await call(admin(), groupEndpoints.addMember, {
      params: { groupId: group.id, userId: leaver.userId },
    }).expect(200);

    await leaver.agent
      .post('/api/auth/organization/leave')
      .send({ organizationId: tenantId })
      .expect(200);
    const res = await call(admin(), groupEndpoints.get, { params: { groupId: group.id } });
    expect((res.body as Group).memberCount).toBe(0);
  });
});

describe('groups: who can do what', () => {
  // One case per endpoint; `manage` endpoints need the groups.manage capability (admin+).
  const cases = [
    ['list', groupEndpoints.list, false],
    ['get', groupEndpoints.get, false],
    ['listMembers', groupEndpoints.listMembers, false],
    ['create', groupEndpoints.create, true],
    ['update', groupEndpoints.update, true],
    ['delete', groupEndpoints.delete, true],
    ['addMember', groupEndpoints.addMember, true],
    ['removeMember', groupEndpoints.removeMember, true],
  ] as const;

  it.each(
    cases.flatMap(([name, contract, manage]) =>
      roles.map((role) => [name, role, contract, manage] as const),
    ),
  )('%s as %s', async (name, role, contract, manage) => {
    // A fresh group (with the viewer in it) per case, so deletes don't affect other cases.
    const group = await createGroup();
    await call(admin(), groupEndpoints.addMember, {
      params: { groupId: group.id, userId: members.viewer.userId },
    }).expect(200);
    const input = {
      params: { groupId: group.id, userId: members.viewer.userId },
      body:
        name === 'create'
          ? { name: `New ${crypto.randomUUID().slice(0, 8)}` }
          : name === 'update'
            ? { description: 'Changed' }
            : undefined,
    };

    const res = await call(members[role].agent, contract, input);
    const allowed = manage ? can(role, 'groups.manage') : true;
    if (allowed) expect(res.status).toBeLessThan(300);
    else {
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    }
  });

  it('needs an active workspace', async () => {
    const loner = await signUpVerified(t.server, t.emails, uniqueEmail('loner'));
    const res = await call(loner, groupEndpoints.list).expect(403);
    expect(res.body).toMatchObject({ code: 'NO_ACTIVE_WORKSPACE' });
  });
});

describe('groups: tenant isolation', () => {
  it("cannot see or change another workspace's groups, even as its admin elsewhere", async () => {
    const other = await signUpVerified(t.server, t.emails, uniqueEmail('other-owner'));
    await createWorkspace(other, 'Other', uniqueSlug('other'));
    const theirs = await createGroup('Their group', other);

    const params = { groupId: theirs.id, userId: members.viewer.userId };
    for (const contract of [
      groupEndpoints.get,
      groupEndpoints.listMembers,
      groupEndpoints.delete,
      groupEndpoints.addMember,
      groupEndpoints.removeMember,
    ]) {
      const res = await call(admin(), contract, { params });
      expect(res.status).toBe(404);
    }
    await call(admin(), groupEndpoints.update, {
      params,
      body: { name: 'Hijacked' },
    }).expect(404);

    const list = await call(admin(), groupEndpoints.list, { query: { limit: 100 } }).expect(200);
    expect((list.body as Page<Group>).items.some((g) => g.id === theirs.id)).toBe(false);
    const check = await call(other, groupEndpoints.get, { params: { groupId: theirs.id } }).expect(
      200,
    );
    expect(check.body).toMatchObject({ name: 'Their group', memberCount: 0 });
  });
});

describe('groups: pagination', () => {
  /** A workspace of its own, so other tests' groups don't interleave. */
  async function freshWorkspace() {
    const agent = await signUpVerified(t.server, t.emails, uniqueEmail('pager'));
    await createWorkspace(agent, 'Pager', uniqueSlug('pager'));
    return agent;
  }

  async function allPages<T>(fetch: (cursor?: string) => Promise<Page<T>>): Promise<T[][]> {
    const pages: T[][] = [];
    let cursor: string | undefined;
    do {
      const page = await fetch(cursor);
      pages.push(page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return pages;
  }

  it('pages through groups by name without repeats or gaps', async () => {
    const agent = await freshWorkspace();
    const names = ['Delta', 'alpha', 'Charlie', 'bravo', 'Echo'];
    for (const name of names) await createGroup(name, agent);

    const pages = await allPages(async (cursor) => {
      const res = await call(agent, groupEndpoints.list, { query: { limit: 2, cursor } }).expect(
        200,
      );
      return res.body as Page<Group>;
    });
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    const listed = pages.flat().map((g) => g.name);
    expect(new Set(listed)).toEqual(new Set(names));
    expect(listed).toHaveLength(names.length);
  });

  it('pages through group members', async () => {
    const agent = await freshWorkspace();
    const group = await createGroup('Everyone', agent);
    const joined = [];
    for (let i = 0; i < 3; i++)
      joined.push(await inviteAndJoin(t.server, t.emails, agent, 'viewer'));
    for (const m of joined) {
      await call(agent, groupEndpoints.addMember, {
        params: { groupId: group.id, userId: m.userId },
      }).expect(200);
    }

    const pages = await allPages(async (cursor) => {
      const res = await call(agent, groupEndpoints.listMembers, {
        params: { groupId: group.id },
        query: { limit: 2, cursor },
      }).expect(200);
      return res.body as Page<GroupMember>;
    });
    expect(pages.map((p) => p.length)).toEqual([2, 1]);
    expect(new Set(pages.flat().map((m) => m.userId))).toEqual(
      new Set(joined.map((m) => m.userId)),
    );
  });

  it.each(['garbage', Buffer.from('["a","b","c"]').toString('base64url')])(
    'rejects an invalid cursor %s',
    async (cursor) => {
      const res = await call(admin(), groupEndpoints.list, { query: { cursor } }).expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_CURSOR' });
    },
  );
});

describe('groups: the database agrees', () => {
  it('stores groups under the active workspace', async () => {
    const group = await createGroup();
    const result = await owner.db.execute<{ tenant_id: string }>(
      sql`select tenant_id from groups where id = ${group.id}`,
    );
    expect(result.rows[0]?.tenant_id).toBe(tenantId);
  });
});
