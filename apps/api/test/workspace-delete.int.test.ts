import { createDb } from '@evidence/db';
import type { MeResponse, WorkspaceRole } from '@evidence/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import {
  Agent,
  createWorkspace,
  signIn,
  signUpVerified,
  uniqueEmail,
  uniqueSlug,
} from './support/auth.js';
import { testEnv } from './support/env.js';

let t: TestApp;
const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
  await owner.pool.end();
});

async function me(agent: Agent): Promise<MeResponse> {
  return (await agent.get('/api/me').expect(200)).body as MeResponse;
}

async function addMember(inviter: Agent, role: WorkspaceRole) {
  const email = uniqueEmail(role);
  await inviter.post('/api/auth/organization/invite-member').send({ email, role }).expect(200);
  const invitationId = t.emails.lastLinkTo(email).split('/').at(-1);
  const agent = await signUpVerified(t.server, t.emails, email);
  await agent.post('/api/auth/organization/accept-invitation').send({ invitationId }).expect(200);
  return { agent, email, userId: (await me(agent)).user.id };
}

/** A workspace with an owner, an admin, a pending invitation, a group and an audit entry. */
async function populatedWorkspace() {
  const ownerEmail = uniqueEmail('owner');
  const ownerAgent = await signUpVerified(t.server, t.emails, ownerEmail, 'Olivia Owner');
  const slug = uniqueSlug('doomed');
  const tenantId = await createWorkspace(ownerAgent, 'Doomed', slug);
  const admin = await addMember(ownerAgent, 'admin');
  await ownerAgent
    .post('/api/auth/organization/invite-member')
    .send({ email: uniqueEmail('pending'), role: 'viewer' })
    .expect(200);
  await owner.db.execute(sql`
    with g as (insert into groups (tenant_id, name) values (${tenantId}, 'Reviewers') returning id)
    insert into group_members (tenant_id, group_id, user_id) select ${tenantId}, id, ${admin.userId} from g
  `);
  await owner.db.execute(sql`
    insert into audit_log (tenant_id, actor_user_id, action, target_type)
    values (${tenantId}, ${admin.userId}, 'test.action', 'test')
  `);
  return { ownerAgent, ownerEmail, tenantId, slug, admin };
}

async function rowsFor(tenantId: string) {
  const result = await owner.db.execute<Record<string, number>>(sql`
    select
      (select count(*)::int from tenants where id = ${tenantId}) as tenants,
      (select count(*)::int from memberships where tenant_id = ${tenantId}) as memberships,
      (select count(*)::int from invitations where tenant_id = ${tenantId}) as invitations,
      (select count(*)::int from groups where tenant_id = ${tenantId}) as groups,
      (select count(*)::int from group_members where tenant_id = ${tenantId}) as group_members,
      (select count(*)::int from audit_log where tenant_id = ${tenantId}) as audit_log
  `);
  return result.rows[0];
}

const deleteWorkspace = (agent: Agent, organizationId: string, confirmSlug?: string) =>
  agent.post('/api/auth/organization/delete').send({ organizationId, confirmSlug });

describe('deleting a workspace', () => {
  it('lets the owner delete it, removing everything in it and nothing else', async () => {
    const { ownerAgent, tenantId, slug, admin } = await populatedWorkspace();
    const bystander = await populatedWorkspace();

    await deleteWorkspace(ownerAgent, tenantId, slug).expect(200);

    expect(await rowsFor(tenantId)).toEqual({
      tenants: 0,
      memberships: 0,
      invitations: 0,
      groups: 0,
      group_members: 0,
      audit_log: 0,
    });
    // People keep their accounts; another workspace is untouched.
    expect((await me(ownerAgent)).activeWorkspace).toBeNull();
    expect((await me(admin.agent)).activeWorkspace).toBeNull();
    expect(await rowsFor(bystander.tenantId)).toEqual({
      tenants: 1,
      memberships: 2,
      invitations: 2,
      groups: 1,
      group_members: 1,
      audit_log: 1,
    });
  });

  it.each([
    ['without a confirmation', undefined],
    ['with the wrong slug', 'not-the-slug'],
    ['with the name instead of the slug', 'Doomed'],
  ])('is refused %s', async (_, confirmSlug) => {
    const { ownerAgent, tenantId } = await populatedWorkspace();
    const res = await deleteWorkspace(ownerAgent, tenantId, confirmSlug).expect(400);
    expect(res.body).toMatchObject({ code: 'DELETE_CONFIRMATION_MISMATCH' });
    expect((await rowsFor(tenantId))?.tenants).toBe(1);
    // Refusing happens before Better Auth clears the active workspace.
    expect((await me(ownerAgent)).activeWorkspace?.id).toBe(tenantId);
  });

  it.each(['admin', 'editor', 'viewer'] as const)(
    'is refused for an %s, even with the right confirmation',
    async (role) => {
      const { ownerAgent, tenantId, slug } = await populatedWorkspace();
      const member = await addMember(ownerAgent, role);
      await deleteWorkspace(member.agent, tenantId, slug).expect(403);
      expect((await rowsFor(tenantId))?.tenants).toBe(1);
    },
  );

  it("cannot delete someone else's workspace", async () => {
    const attacker = await populatedWorkspace();
    const victim = await populatedWorkspace();

    // Confirming with the attacker's own slug doesn't match the victim's workspace...
    await deleteWorkspace(attacker.ownerAgent, victim.tenantId, attacker.slug).expect(400);
    // ...and the right slug still needs ownership of that workspace.
    const res = await deleteWorkspace(attacker.ownerAgent, victim.tenantId, victim.slug);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await rowsFor(victim.tenantId))?.tenants).toBe(1);
  });

  it('sends members to another of their workspaces on their next sign-in', async () => {
    const { ownerAgent, tenantId, slug, admin } = await populatedWorkspace();
    const elsewhere = await createWorkspace(admin.agent, 'Elsewhere', uniqueSlug('elsewhere'));

    await deleteWorkspace(ownerAgent, tenantId, slug).expect(200);
    const fresh = await signIn(t.server, admin.email);
    expect((await me(fresh)).activeWorkspace?.id).toBe(elsewhere);
  });

  it('lets a former sole owner delete their account afterwards', async () => {
    const { ownerAgent, ownerEmail, tenantId, slug } = await populatedWorkspace();
    await ownerAgent.post('/api/auth/delete-user').send({}).expect(400);

    await deleteWorkspace(ownerAgent, tenantId, slug).expect(200);
    await ownerAgent.post('/api/auth/delete-user').send({}).expect(200);
    expect(t.emails.lastLinkTo(ownerEmail)).toMatch(/^\/account\/delete\?token=/);
  });
});
