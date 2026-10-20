import type { MeResponse } from '@evidence/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import {
  Agent,
  createWorkspace,
  inviteAndJoin,
  signUpVerified,
  uniqueEmail,
  uniqueSlug,
} from './support/auth.js';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
});

interface Member {
  id: string;
  userId: string;
  role: string;
}

/** A fresh workspace with its owner; members are added per test. */
async function workspace() {
  const ownerEmail = uniqueEmail('owner');
  const ownerAgent = await signUpVerified(t.server, t.emails, ownerEmail, 'Olivia Owner');
  const slug = uniqueSlug('team');
  const tenantId = await createWorkspace(ownerAgent, 'Team', slug);
  const join = (role: string) => inviteAndJoin(t.server, t.emails, ownerAgent, role);
  return { ownerAgent, ownerEmail, tenantId, slug, join };
}

async function membersOf(agent: Agent): Promise<Member[]> {
  const res = await agent.get('/api/auth/organization/list-members').expect(200);
  return (res.body as { members: Member[] }).members;
}

async function memberIdOf(agent: Agent, userId: string): Promise<string> {
  const member = (await membersOf(agent)).find((m) => m.userId === userId);
  if (!member) throw new Error(`No member for ${userId}`);
  return member.id;
}

async function userIdOf(agent: Agent): Promise<string> {
  return ((await agent.get('/api/me').expect(200)).body as MeResponse).user.id;
}

const setRole = (agent: Agent, memberId: string, role: string) =>
  agent.post('/api/auth/organization/update-member-role').send({ memberId, role });

const removeMember = (agent: Agent, memberIdOrEmail: string) =>
  agent.post('/api/auth/organization/remove-member').send({ memberIdOrEmail });

async function roleOf(agent: Agent, userId: string): Promise<string | undefined> {
  return (await membersOf(agent)).find((m) => m.userId === userId)?.role;
}

describe('changing roles', () => {
  it('lets an admin change editors, viewers and other admins', async () => {
    const { ownerAgent, join } = await workspace();
    const admin = await join('admin');
    const otherAdmin = await join('admin');
    const viewer = await join('viewer');

    await setRole(admin.agent, await memberIdOf(ownerAgent, viewer.userId), 'editor').expect(200);
    await setRole(admin.agent, await memberIdOf(ownerAgent, otherAdmin.userId), 'viewer').expect(
      200,
    );
    expect(await roleOf(ownerAgent, viewer.userId)).toBe('editor');
    expect(await roleOf(ownerAgent, otherAdmin.userId)).toBe('viewer');
  });

  it('does not let an admin make anyone an owner or change an owner', async () => {
    const { ownerAgent, join } = await workspace();
    const admin = await join('admin');
    const viewer = await join('viewer');
    const ownerId = await userIdOf(ownerAgent);

    await setRole(admin.agent, await memberIdOf(ownerAgent, viewer.userId), 'owner').expect(403);
    await setRole(admin.agent, await memberIdOf(ownerAgent, admin.userId), 'owner').expect(403);
    await setRole(admin.agent, await memberIdOf(ownerAgent, ownerId), 'viewer').expect(403);
    await removeMember(admin.agent, await memberIdOf(ownerAgent, ownerId)).expect(400);
    expect(await roleOf(ownerAgent, ownerId)).toBe('owner');
  });

  it.each(['editor', 'viewer'])(
    'does not let an %s change roles or remove anyone',
    async (role) => {
      const { ownerAgent, join } = await workspace();
      const actor = await join(role);
      const target = await join('viewer');
      const targetMemberId = await memberIdOf(ownerAgent, target.userId);

      await setRole(actor.agent, targetMemberId, 'editor').expect(403);
      const removed = await removeMember(actor.agent, targetMemberId);
      expect([401, 403]).toContain(removed.status);
      expect(await roleOf(ownerAgent, target.userId)).toBe('viewer');
    },
  );

  it('refuses roles outside owner/admin/editor/viewer', async () => {
    const { ownerAgent, join } = await workspace();
    const viewer = await join('viewer');
    const memberId = await memberIdOf(ownerAgent, viewer.userId);
    for (const role of ['member', 'admin,owner', 'superuser']) {
      const res = await setRole(ownerAgent, memberId, role);
      expect(res.status).toBe(400);
    }
    expect(await roleOf(ownerAgent, viewer.userId)).toBe('viewer');
  });

  it("can't change a member of another workspace", async () => {
    const mine = await workspace();
    const theirs = await workspace();
    const victim = await theirs.join('viewer');
    const victimMemberId = await memberIdOf(theirs.ownerAgent, victim.userId);

    const res = await setRole(mine.ownerAgent, victimMemberId, 'admin');
    expect(res.status).toBeGreaterThanOrEqual(400);
    const removed = await removeMember(mine.ownerAgent, victimMemberId);
    expect(removed.status).toBeGreaterThanOrEqual(400);
    expect(await roleOf(theirs.ownerAgent, victim.userId)).toBe('viewer');
  });
});

describe('owners', () => {
  it('transfers ownership: promote another owner, then step down', async () => {
    const { ownerAgent, join } = await workspace();
    const admin = await join('admin');
    const ownerId = await userIdOf(ownerAgent);

    await setRole(ownerAgent, await memberIdOf(ownerAgent, admin.userId), 'owner').expect(200);
    await setRole(ownerAgent, await memberIdOf(ownerAgent, ownerId), 'admin').expect(200);

    expect(await roleOf(admin.agent, admin.userId)).toBe('owner');
    expect(await roleOf(admin.agent, ownerId)).toBe('admin');
    expect(((await admin.agent.get('/api/me')).body as MeResponse).activeWorkspace?.role).toBe(
      'owner',
    );
  });

  it('keeps at least one owner: the last owner cannot step down, leave or be removed', async () => {
    const { ownerAgent, tenantId } = await workspace();
    const ownerId = await userIdOf(ownerAgent);
    const ownerMemberId = await memberIdOf(ownerAgent, ownerId);

    await setRole(ownerAgent, ownerMemberId, 'admin').expect(400);
    await ownerAgent
      .post('/api/auth/organization/leave')
      .send({ organizationId: tenantId })
      .expect(400);
    await removeMember(ownerAgent, ownerMemberId).expect(400);
    expect(await roleOf(ownerAgent, ownerId)).toBe('owner');
  });

  it('lets one of two owners remove the other', async () => {
    const { ownerAgent, join } = await workspace();
    const second = await join('owner');
    await removeMember(ownerAgent, await memberIdOf(ownerAgent, second.userId)).expect(200);
    expect(await roleOf(ownerAgent, second.userId)).toBeUndefined();
  });
});

describe('removing and leaving', () => {
  it('removes a member, who loses access right away', async () => {
    const { ownerAgent, join } = await workspace();
    const editor = await join('editor');
    await removeMember(ownerAgent, await memberIdOf(ownerAgent, editor.userId)).expect(200);

    expect(((await editor.agent.get('/api/me')).body as MeResponse).activeWorkspace).toBeNull();
    await editor.agent.get('/api/groups').expect(403);
  });

  it('lets any member leave', async () => {
    const { ownerAgent, tenantId, join } = await workspace();
    const viewer = await join('viewer');
    await viewer.agent
      .post('/api/auth/organization/leave')
      .send({ organizationId: tenantId })
      .expect(200);
    expect(await roleOf(ownerAgent, viewer.userId)).toBeUndefined();
    expect(((await viewer.agent.get('/api/me')).body as MeResponse).activeWorkspace).toBeNull();
  });
});

describe('invitations', () => {
  interface Invitation {
    id: string;
    email: string;
    role: string;
    status: string;
  }

  const invite = (agent: Agent, email: string, role: string) =>
    agent.post('/api/auth/organization/invite-member').send({ email, role });

  async function pendingInvitations(agent: Agent): Promise<Invitation[]> {
    const res = await agent.get('/api/auth/organization/list-invitations').expect(200);
    return (res.body as Invitation[]).filter((i) => i.status === 'pending');
  }

  const invitationIdFrom = (email: string) => t.emails.lastLinkTo(email).split('/').at(-1) ?? '';

  it('resending replaces the pending invitation: only the newest link works', async () => {
    const { ownerAgent } = await workspace();
    const email = uniqueEmail('invitee');
    await invite(ownerAgent, email, 'viewer').expect(200);
    const firstId = invitationIdFrom(email);
    await invite(ownerAgent, email, 'editor').expect(200);
    const secondId = invitationIdFrom(email);

    expect(secondId).not.toBe(firstId);
    expect(t.emails.to(email)).toHaveLength(2);
    const pending = (await pendingInvitations(ownerAgent)).filter((i) => i.email === email);
    expect(pending.map((i) => [i.id, i.role])).toEqual([[secondId, 'editor']]);

    const invitee = await signUpVerified(t.server, t.emails, email);
    await invitee
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId: firstId })
      .expect(400);
    await invitee
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId: secondId })
      .expect(200);
  });

  it('lets admins cancel invitations, except invitations to become an owner', async () => {
    const { ownerAgent, join } = await workspace();
    const admin = await join('admin');
    const editorEmail = uniqueEmail('future-editor');
    const ownerEmail = uniqueEmail('future-owner');
    await invite(ownerAgent, editorEmail, 'editor').expect(200);
    await invite(ownerAgent, ownerEmail, 'owner').expect(200);

    await admin.agent
      .post('/api/auth/organization/cancel-invitation')
      .send({ invitationId: invitationIdFrom(editorEmail) })
      .expect(200);
    const refused = await admin.agent
      .post('/api/auth/organization/cancel-invitation')
      .send({ invitationId: invitationIdFrom(ownerEmail) })
      .expect(403);
    expect(refused.body).toMatchObject({ code: 'OWNER_ONLY' });

    expect((await pendingInvitations(ownerAgent)).map((i) => i.email)).toEqual([ownerEmail]);
    await ownerAgent
      .post('/api/auth/organization/cancel-invitation')
      .send({ invitationId: invitationIdFrom(ownerEmail) })
      .expect(200);
  });

  it.each(['editor', 'viewer'])('does not let an %s cancel invitations', async (role) => {
    const { ownerAgent, join } = await workspace();
    const actor = await join(role);
    const email = uniqueEmail('pending');
    await invite(ownerAgent, email, 'viewer').expect(200);
    await actor.agent
      .post('/api/auth/organization/cancel-invitation')
      .send({ invitationId: invitationIdFrom(email) })
      .expect(403);
  });

  it('shows pending invitations only to admins and owners', async () => {
    const { ownerAgent, join } = await workspace();
    const admin = await join('admin');
    const editor = await join('editor');
    const viewer = await join('viewer');
    await invite(ownerAgent, uniqueEmail('secret'), 'viewer').expect(200);

    expect(await pendingInvitations(admin.agent)).toHaveLength(1);
    for (const member of [editor, viewer]) {
      const list = await member.agent.get('/api/auth/organization/list-invitations').expect(403);
      expect(list.body).toMatchObject({ code: 'INSUFFICIENT_ROLE' });
      const full = await member.agent
        .get('/api/auth/organization/get-full-organization')
        .expect(200);
      expect((full.body as { invitations: unknown[] }).invitations).toEqual([]);
      expect((full.body as { members: unknown[] }).members.length).toBeGreaterThan(0);
    }
    const full = await admin.agent.get('/api/auth/organization/get-full-organization').expect(200);
    const invitations = (full.body as { invitations: Invitation[] }).invitations;
    expect(invitations.filter((i) => i.status === 'pending')).toHaveLength(1);
  });

  it('lists the invitations addressed to me, and lets me decline one', async () => {
    const a = await workspace();
    const b = await workspace();
    const email = uniqueEmail('popular');
    await invite(a.ownerAgent, email, 'viewer').expect(200);
    await invite(b.ownerAgent, email, 'editor').expect(200);
    await invite(a.ownerAgent, uniqueEmail('someone-else'), 'viewer').expect(200);
    const fromB = invitationIdFrom(email);

    const me = await signUpVerified(t.server, t.emails, email);
    const mine = await me.get('/api/auth/organization/list-user-invitations').expect(200);
    expect((mine.body as Invitation[]).map((i) => i.email)).toEqual([email, email]);

    // Someone else can't decline it for me.
    const stranger = await signUpVerified(t.server, t.emails, uniqueEmail('stranger'));
    await stranger
      .post('/api/auth/organization/reject-invitation')
      .send({ invitationId: fromB })
      .expect(403);

    await me
      .post('/api/auth/organization/reject-invitation')
      .send({ invitationId: fromB })
      .expect(200);
    const after = await me.get('/api/auth/organization/list-user-invitations').expect(200);
    expect(after.body).toHaveLength(1);
    await me
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId: fromB })
      .expect(400);
  });

  it("doesn't take an email address from the browser for list-user-invitations", async () => {
    const someone = await signUpVerified(t.server, t.emails, uniqueEmail('nosy'));
    await someone
      .get('/api/auth/organization/list-user-invitations')
      .query({ email: 'victim@example.test' })
      .expect(400);
  });
});

describe('renaming', () => {
  const rename = (agent: Agent, data: object) =>
    agent.post('/api/auth/organization/update').send({ data });

  it('lets admins rename (trimmed), but not editors or viewers', async () => {
    const { ownerAgent, join } = await workspace();
    const admin = await join('admin');
    await rename(admin.agent, { name: '  Research team ' }).expect(200);
    expect(((await ownerAgent.get('/api/me')).body as MeResponse).activeWorkspace?.name).toBe(
      'Research team',
    );

    for (const role of ['editor', 'viewer']) {
      const member = await join(role);
      const res = await rename(member.agent, { name: 'Taken over' });
      expect(res.status).toBe(403);
    }
  });

  it.each([
    ['a new slug', { slug: 'new-slug' }],
    ['a slug together with a name', { name: 'Fine', slug: 'new-slug' }],
    ['a logo', { logo: 'javascript:alert(1)' }],
    ['metadata', { metadata: { plan: 'enterprise' } }],
    ['a blank name', { name: '  ' }],
  ])('refuses %s', async (_, data) => {
    const { ownerAgent, slug } = await workspace();
    const res = await rename(ownerAgent, data).expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_WORKSPACE_UPDATE' });
    expect(((await ownerAgent.get('/api/me')).body as MeResponse).activeWorkspace).toMatchObject({
      slug,
      name: 'Team',
    });
  });
});

describe('features we keep switched off', () => {
  it.each([
    ['POST', '/api/auth/organization/create-team', { name: 'Team' }],
    ['GET', '/api/auth/organization/list-teams', undefined],
    ['POST', '/api/auth/organization/create-role', { role: 'superuser', permission: {} }],
    ['GET', '/api/auth/organization/list-roles', undefined],
  ] as const)('refuses %s %s', async (method, path, body) => {
    const { ownerAgent } = await workspace();
    const req = method === 'GET' ? ownerAgent.get(path) : ownerAgent.post(path).send(body);
    const res = await req;
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('refuses to add members directly instead of by invitation', async () => {
    const { ownerAgent, tenantId } = await workspace();
    const outsider = await signUpVerified(t.server, t.emails, uniqueEmail('direct'));
    const userId = await userIdOf(outsider);
    const res = await ownerAgent
      .post('/api/auth/organization/add-member')
      .send({ userId, role: 'admin', organizationId: tenantId });
    expect(res.status).toBe(404);
  });
});
