import { hasAtLeastRole, WorkspaceRole } from '@evidence/shared';
import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Roles } from '../src/auth/roles.decorator.js';
import { createTestApp, TestApp } from './support/app.js';
import { Agent, createWorkspace, signUpVerified, uniqueEmail, uniqueSlug } from './support/auth.js';

/** One route per minimum role. The class default (editor) is overridden per method. */
@Controller('rbac-probe')
@Roles('editor')
class RbacProbeController {
  @Get('viewer')
  @Roles('viewer')
  viewer() {
    return { ok: true };
  }

  // Inherits the controller's @Roles('editor').
  @Get('editor')
  editor() {
    return { ok: true };
  }

  @Get('admin')
  @Roles('admin')
  admin() {
    return { ok: true };
  }

  @Get('owner')
  @Roles('owner')
  owner() {
    return { ok: true };
  }
}

/** No @Roles: any signed-in user, with or without a workspace. */
@Controller('rbac-open')
class OpenProbeController {
  @Get()
  open() {
    return { ok: true };
  }
}

const levels: WorkspaceRole[] = ['viewer', 'editor', 'admin', 'owner'];

let t: TestApp;
let tenantId: string;
const agents = {} as Record<WorkspaceRole, Agent>;
const emails = {} as Record<WorkspaceRole, string>;

async function join(owner: Agent, role: Exclude<WorkspaceRole, 'owner'>) {
  const email = uniqueEmail(role);
  await owner.post('/api/auth/organization/invite-member').send({ email, role }).expect(200);
  const invitationId = t.emails.lastLinkTo(email).split('/').pop();
  const agent = await signUpVerified(t.server, t.emails, email);
  await agent.post('/api/auth/organization/accept-invitation').send({ invitationId }).expect(200);
  await agent
    .post('/api/auth/organization/set-active')
    .send({ organizationId: tenantId })
    .expect(200);
  agents[role] = agent;
  emails[role] = email;
}

async function memberId(email: string): Promise<string> {
  const res = await agents.owner
    .get('/api/auth/organization/get-full-organization')
    .query({ organizationId: tenantId })
    .expect(200);
  const members = (res.body as { members: { id: string; user: { email: string } }[] }).members;
  const member = members.find((m) => m.user.email === email);
  if (!member) throw new Error(`No member ${email}`);
  return member.id;
}

beforeAll(async () => {
  t = await createTestApp({ controllers: [RbacProbeController, OpenProbeController] });
  emails.owner = uniqueEmail('owner');
  agents.owner = await signUpVerified(t.server, t.emails, emails.owner);
  tenantId = await createWorkspace(agents.owner, 'RBAC', uniqueSlug('rbac'));
  for (const role of ['admin', 'editor', 'viewer'] as const) await join(agents.owner, role);
});

afterAll(async () => {
  await t.app.close();
});

describe('@Roles enforces the minimum role', () => {
  const matrix = levels.flatMap((role) =>
    levels.map((minimum) => ({ role, minimum, allowed: hasAtLeastRole(role, minimum) })),
  );

  it.each(matrix)(
    '$role on a $minimum route → allowed: $allowed',
    async ({ role, minimum, allowed }) => {
      const res = await agents[role].get(`/api/rbac-probe/${minimum}`);
      if (allowed) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'INSUFFICIENT_ROLE' });
      }
    },
  );

  it('lets every member through a route without @Roles', async () => {
    for (const role of levels) await agents[role].get('/api/rbac-open').expect(200);
  });
});

describe('what @Roles never lets through', () => {
  it('returns 401, not 403, without a session (authentication runs first)', async () => {
    await request(t.server).get('/api/rbac-probe/viewer').expect(401);
  });

  it('refuses a signed-in user without an active workspace', async () => {
    const loner = await signUpVerified(t.server, t.emails, uniqueEmail('loner'));
    const res = await loner.get('/api/rbac-probe/viewer').expect(403);
    expect(res.body).toMatchObject({ code: 'NO_ACTIVE_WORKSPACE' });
    // Routes without @Roles stay open to any signed-in user.
    await loner.get('/api/rbac-open').expect(200);
  });

  it('applies a role change on the very next request', async () => {
    const changeRole = async (role: WorkspaceRole) => {
      await agents.owner
        .post('/api/auth/organization/update-member-role')
        .send({ memberId: await memberId(emails.editor), role })
        .expect(200);
    };

    await agents.editor.get('/api/rbac-probe/admin').expect(403);
    await changeRole('admin');
    await agents.editor.get('/api/rbac-probe/admin').expect(200);
    await changeRole('viewer');
    await agents.editor.get('/api/rbac-probe/editor').expect(403);
    await changeRole('editor');
    await agents.editor.get('/api/rbac-probe/editor').expect(200);
  });

  it('does not let an admin promote anyone to owner', async () => {
    const res = await agents.admin
      .post('/api/auth/organization/update-member-role')
      .send({ memberId: await memberId(emails.viewer), role: 'owner' });
    expect(res.status).toBe(403);
    await agents.viewer.get('/api/rbac-probe/owner').expect(403);
  });

  it('does not let a viewer change roles', async () => {
    const res = await agents.viewer
      .post('/api/auth/organization/update-member-role')
      .send({ memberId: await memberId(emails.viewer), role: 'admin' });
    expect(res.status).toBe(403);
  });
});
