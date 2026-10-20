import { createDb } from '@evidence/db';
import type { MeResponse } from '@evidence/shared';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import {
  Agent,
  browser,
  createWorkspace,
  expectNoWorkspaceAccess,
  signUpVerified,
  TEST_PASSWORD,
  uniqueEmail,
  uniqueSlug,
} from './support/auth.js';
import { testEnv } from './support/env.js';

let t: TestApp;
const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });
const redis = new Redis(testEnv.TEST_REDIS_URL);

/** The raw session token of a user's latest session, via the Postgres copy. */
async function sessionToken(email: string): Promise<string> {
  const result = await owner.db.execute<{ token: string }>(sql`
    select s.token from sessions s join users u on u.id = s.user_id
    where u.email = ${email} order by s.created_at desc limit 1
  `);
  const token = result.rows[0]?.token;
  if (!token) throw new Error(`No session for ${email}`);
  return token;
}

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
  await owner.pool.end();
  redis.disconnect();
});

function invitationIdFrom(path: string): string {
  const id = /^\/invite\/([0-9a-f-]{36})$/.exec(path)?.[1];
  if (!id) throw new Error(`Not an invitation link: ${path}`);
  return id;
}

/** Owner with a fresh workspace, plus a helper to invite people into it. */
async function ownerWithWorkspace() {
  const email = uniqueEmail('owner');
  const agent = await signUpVerified(t.server, t.emails, email, 'Olivia Owner');
  const tenantId = await createWorkspace(agent, 'Acme Research', uniqueSlug('acme'));
  return { agent, email, tenantId };
}

function invite(inviter: Agent, email: string, role: string) {
  return inviter.post('/api/auth/organization/invite-member').send({ email, role });
}

async function inviteAndAccept(inviter: Agent, role: string) {
  const email = uniqueEmail(role);
  await invite(inviter, email, role).expect(200);
  const invitationId = invitationIdFrom(t.emails.lastLinkTo(email));
  const agent = await signUpVerified(t.server, t.emails, email, `New ${role}`);
  await agent.post('/api/auth/organization/accept-invitation').send({ invitationId }).expect(200);
  return { agent, email };
}

describe('sign-up and sign-in', () => {
  it('requires a verified email before signing in', async () => {
    const email = uniqueEmail('unverified');
    const agent = browser(t.server);
    await agent
      .post('/api/auth/sign-up/email')
      .send({ name: 'Una', email, password: TEST_PASSWORD })
      .expect(200);

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email, password: TEST_PASSWORD })
      .expect(403);
    await agent.get('/api/me').expect(401);
  });

  it('signs in after verification and shares the session with the API', async () => {
    const email = uniqueEmail('verified');
    await signUpVerified(t.server, t.emails, email, 'Vera');

    const fresh = browser(t.server);
    await fresh
      .post('/api/auth/sign-in/email')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    const me = await fresh.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ user: { email, emailVerified: true }, activeWorkspace: null });
  });

  it('rejects passwords shorter than 12 characters', async () => {
    await browser(t.server)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Short', email: uniqueEmail('short'), password: 'short-pw' })
      .expect(400);
  });

  it('rejects requests without a session', async () => {
    await request(t.server).get('/api/me').expect(401);
  });

  it('rejects a forged session cookie', async () => {
    await request(t.server)
      .get('/api/me')
      .set('Cookie', 'evidence.session_token=forged.token')
      .expect(401);
  });
});

describe('workspaces', () => {
  it('makes the creator the owner of the new active workspace', async () => {
    const { agent, tenantId } = await ownerWithWorkspace();
    const me = await agent.get('/api/me').expect(200);
    expect((me.body as MeResponse).activeWorkspace).toMatchObject({ id: tenantId, role: 'owner' });
  });

  it('rejects an invalid slug with a 400', async () => {
    const agent = await signUpVerified(t.server, t.emails, uniqueEmail('slug'));
    await agent
      .post('/api/auth/organization/create')
      .send({ name: 'Bad', slug: 'Not A Slug!' })
      .expect(400);
  });
});

describe('invitations', () => {
  it('emails an invitation and lets the invitee join with the invited role', async () => {
    const { agent: ownerAgent, tenantId } = await ownerWithWorkspace();
    const { agent: viewer } = await inviteAndAccept(ownerAgent, 'viewer');

    // Joining does not switch workspaces; the invitee selects it.
    await viewer
      .post('/api/auth/organization/set-active')
      .send({ organizationId: tenantId })
      .expect(200);
    const me = await viewer.get('/api/me').expect(200);
    expect((me.body as MeResponse).activeWorkspace).toMatchObject({ id: tenantId, role: 'viewer' });
  });

  it('escapes user-controlled names in the invitation email', async () => {
    const agent = await signUpVerified(
      t.server,
      t.emails,
      uniqueEmail('xss'),
      '<script>x</script>',
    );
    await createWorkspace(agent, '<img src=x onerror=alert(1)>', uniqueSlug('xss'));
    const email = uniqueEmail('xss-invitee');
    await invite(agent, email, 'viewer').expect(200);

    const html = t.emails.sent.findLast((m) => m.to === email)?.html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not let editors or viewers invite people', async () => {
    const { agent: ownerAgent, tenantId } = await ownerWithWorkspace();
    for (const role of ['viewer', 'editor']) {
      const { agent } = await inviteAndAccept(ownerAgent, role);
      await agent
        .post('/api/auth/organization/set-active')
        .send({ organizationId: tenantId })
        .expect(200);
      const res = await invite(agent, uniqueEmail('blocked'), 'viewer');
      expect(res.status).toBe(403);
    }
  });

  it('does not let an admin invite someone as owner', async () => {
    const { agent: ownerAgent, tenantId } = await ownerWithWorkspace();
    const { agent: admin } = await inviteAndAccept(ownerAgent, 'admin');
    await admin
      .post('/api/auth/organization/set-active')
      .send({ organizationId: tenantId })
      .expect(200);

    const res = await invite(admin, uniqueEmail('new-owner'), 'owner');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it.each(['member', 'superadmin'])('rejects inviting with unknown role %s', async (role) => {
    const { agent } = await ownerWithWorkspace();
    const res = await invite(agent, uniqueEmail('unknown-role'), role);
    expect(res.status).toBe(400);
  });

  it('only lets the invited email address accept', async () => {
    const { agent: ownerAgent } = await ownerWithWorkspace();
    const invited = uniqueEmail('invited');
    await invite(ownerAgent, invited, 'editor').expect(200);
    const invitationId = invitationIdFrom(t.emails.lastLinkTo(invited));

    const intruder = await signUpVerified(t.server, t.emails, uniqueEmail('intruder'));
    const res = await intruder
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('does not let an unverified account accept, even with the invited email', async () => {
    const { agent: ownerAgent } = await ownerWithWorkspace();
    const invited = uniqueEmail('unverified-invitee');
    await invite(ownerAgent, invited, 'editor').expect(200);
    const invitationId = invitationIdFrom(t.emails.lastLinkTo(invited));

    const agent = browser(t.server);
    await agent
      .post('/api/auth/sign-up/email')
      .send({ name: 'Ursula', email: invited, password: TEST_PASSWORD })
      .expect(200);
    // No session without verification, so the accept call cannot succeed.
    const res = await agent.post('/api/auth/organization/accept-invitation').send({ invitationId });
    expect(res.status).toBe(401);
  });
});

describe('active workspace checks (AuthGuard)', () => {
  it('cannot switch to a workspace you are not a member of', async () => {
    const { tenantId: otherTenant } = await ownerWithWorkspace();
    const outsider = await signUpVerified(t.server, t.emails, uniqueEmail('outsider'));

    const res = await outsider
      .post('/api/auth/organization/set-active')
      .send({ organizationId: otherTenant });
    expect(res.status).toBe(403);
    const me = await outsider.get('/api/me').expect(200);
    expect((me.body as MeResponse).activeWorkspace).toBeNull();
  });

  it('refuses a session whose active workspace was tampered with in Redis', async () => {
    const { tenantId: victimTenant } = await ownerWithWorkspace();
    const attackerEmail = uniqueEmail('attacker');
    const attacker = await signUpVerified(t.server, t.emails, attackerEmail);

    // Sessions are read from Redis; rewrite the attacker's stored session to point at the victim.
    const key = `${t.env.AUTH_REDIS_KEY_PREFIX}${await sessionToken(attackerEmail)}`;
    const raw = await redis.get(key);
    if (!raw) throw new Error('Session not found in Redis');
    const stored = JSON.parse(raw) as { session: Record<string, unknown> };
    stored.session.activeOrganizationId = victimTenant;
    await redis.set(key, JSON.stringify(stored), 'KEEPTTL');

    await expectNoWorkspaceAccess((path) => attacker.get(path));
  });

  it('ignores edits to the Postgres copy of a session (reads come from Redis)', async () => {
    const { tenantId: victimTenant } = await ownerWithWorkspace();
    const attackerEmail = uniqueEmail('db-attacker');
    const attacker = await signUpVerified(t.server, t.emails, attackerEmail);

    await owner.db.execute(sql`
      update sessions set active_tenant_id = ${victimTenant}
      where user_id = (select id from users where email = ${attackerEmail})
    `);
    const me = await attacker.get('/api/me').expect(200);
    expect((me.body as MeResponse).activeWorkspace).toBeNull();
  });

  it('locks out a member as soon as they are removed', async () => {
    const { agent: ownerAgent, tenantId } = await ownerWithWorkspace();
    const { agent: member, email } = await inviteAndAccept(ownerAgent, 'editor');
    await member
      .post('/api/auth/organization/set-active')
      .send({ organizationId: tenantId })
      .expect(200);
    await member.get('/api/me').expect(200);

    await ownerAgent
      .post('/api/auth/organization/remove-member')
      .send({ memberIdOrEmail: email })
      .expect(200);
    await expectNoWorkspaceAccess((path) => member.get(path));
  });
});
