import { createDb } from '@evidence/db';
import type { MeResponse } from '@evidence/shared';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import {
  Agent,
  browser,
  createWorkspace,
  signIn,
  signUpVerified,
  TEST_PASSWORD,
  uniqueEmail,
  uniqueSlug,
} from './support/auth.js';
import { testApiEnv, testEnv } from './support/env.js';

const NEW_PASSWORD = 'a brand new passphrase 42';

let t: TestApp;
const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });
const redis = new Redis(testEnv.TEST_REDIS_URL);

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
  await owner.pool.end();
  redis.disconnect();
});

async function newUser(label: string): Promise<{ agent: Agent; email: string }> {
  const email = uniqueEmail(label);
  const agent = await signUpVerified(t.server, t.emails, email, `${label} user`);
  return { agent, email };
}

async function me(agent: Agent): Promise<MeResponse> {
  return (await agent.get('/api/me').expect(200)).body as MeResponse;
}

async function userCount(email: string): Promise<number> {
  const result = await owner.db.execute<{ n: number }>(
    sql`select count(*)::int as n from users where email = ${email}`,
  );
  return result.rows[0]?.n ?? 0;
}

function signInStatus(email: string, password: string): Promise<number> {
  return browser(t.server)
    .post('/api/auth/sign-in/email')
    .send({ email, password })
    .then((res) => res.status);
}

function queryParam(path: string, name: string): string {
  const value = new URL(path, 'http://localhost').searchParams.get(name);
  if (!value) throw new Error(`No ${name} in ${path}`);
  return value;
}

describe('forgot and reset password', () => {
  const requestReset = (email: string, redirectTo = '/reset-password') =>
    browser(t.server).post('/api/auth/request-password-reset').send({ email, redirectTo });

  /** The token from the reset link, which has the form /api/auth/reset-password/<token>. */
  function resetTokenFor(email: string): string {
    const link = t.emails.lastLinkTo(email);
    const token = /^\/api\/auth\/reset-password\/([^/?]+)/.exec(link)?.[1];
    if (!token) throw new Error(`Not a reset link: ${link}`);
    return token;
  }

  const resetPassword = (token: string, newPassword = NEW_PASSWORD) =>
    browser(t.server).post('/api/auth/reset-password').send({ token, newPassword });

  it('answers the same whether or not the account exists, and only emails real accounts', async () => {
    const { email } = await newUser('forgetful');
    const unknown = uniqueEmail('nobody');

    const known = await requestReset(email).expect(200);
    const missing = await requestReset(unknown).expect(200);

    expect(missing.body).toEqual(known.body);
    expect(t.emails.to(unknown)).toHaveLength(0);
    expect(t.emails.to(email).at(-1)?.subject).toMatch(/reset/i);
  });

  it('resets the password through the emailed link and signs out every device', async () => {
    const { agent, email } = await newUser('resetter');
    const other = await signIn(t.server, email);
    await requestReset(email).expect(200);

    // The emailed link checks the token and lands on the web page with it.
    const landing = await browser(t.server).get(t.emails.lastLinkTo(email)).expect(302);
    expect(landing.headers.location).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);

    await resetPassword(resetTokenFor(email)).expect(200);
    expect(await signInStatus(email, TEST_PASSWORD)).toBe(401);
    expect(await signInStatus(email, NEW_PASSWORD)).toBe(200);
    await agent.get('/api/me').expect(401);
    await other.get('/api/me').expect(401);
    expect(t.emails.to(email).at(-1)?.subject).toMatch(/password was changed/i);
  });

  it('accepts a reset token only once', async () => {
    const { email } = await newUser('replay');
    await requestReset(email).expect(200);
    const token = resetTokenFor(email);

    await resetPassword(token).expect(200);
    const replay = await resetPassword(token, 'an attacker chosen password').expect(400);
    expect(replay.body).toMatchObject({ code: 'INVALID_TOKEN' });
    expect(await signInStatus(email, NEW_PASSWORD)).toBe(200);
  });

  it('refuses an expired token', async () => {
    const { email } = await newUser('expired');
    const pattern = `${t.env.AUTH_REDIS_KEY_PREFIX}verification:*`;
    const before = new Set(await redis.keys(pattern));
    await requestReset(email).expect(200);
    const [key] = (await redis.keys(pattern)).filter((k) => !before.has(k));
    if (!key) throw new Error('No reset token stored in Redis');

    // Age the stored token past its expiry without waiting an hour.
    const stored = JSON.parse((await redis.get(key)) ?? '{}') as { expiresAt: string };
    stored.expiresAt = new Date(Date.now() - 1000).toISOString();
    await redis.set(key, JSON.stringify(stored), 'KEEPTTL');

    const landing = await browser(t.server).get(t.emails.lastLinkTo(email)).expect(302);
    expect(landing.headers.location).toContain('error=INVALID_TOKEN');
    await resetPassword(resetTokenFor(email)).expect(400);
    expect(await signInStatus(email, TEST_PASSWORD)).toBe(200);
  });

  it('stores only a hash of the token, so a Redis dump cannot reset passwords', async () => {
    const { email } = await newUser('hashed');
    await requestReset(email).expect(200);
    const token = resetTokenFor(email);

    const keys = await redis.keys(`${t.env.AUTH_REDIS_KEY_PREFIX}*`);
    const values = await Promise.all(
      keys.map((key) =>
        redis.type(key).then((type) => (type === 'string' ? redis.get(key) : null)),
      ),
    );
    expect(keys.some((key) => key.includes(token))).toBe(false);
    expect(values.some((value) => value?.includes(token))).toBe(false);
  });

  it('refuses a redirect to another site', async () => {
    const { email } = await newUser('phished');
    await requestReset(email, 'https://evil.example/steal').expect(403);
  });

  it('applies the password rules to the new password', async () => {
    const { email } = await newUser('weak');
    await requestReset(email).expect(200);
    await resetPassword(resetTokenFor(email), 'short').expect(400);
  });
});

describe('change password', () => {
  it('requires the current password', async () => {
    const { agent, email } = await newUser('guarded');
    const res = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'not my password at all', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(await signInStatus(email, TEST_PASSWORD)).toBe(200);
  });

  it('can sign out other devices and tells the user by email', async () => {
    const { agent, email } = await newUser('changer');
    const other = await signIn(t.server, email);

    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      })
      .expect(200);

    await agent.get('/api/me').expect(200);
    await other.get('/api/me').expect(401);
    expect(await signInStatus(email, NEW_PASSWORD)).toBe(200);
    expect(t.emails.to(email).at(-1)?.subject).toMatch(/password was changed/i);
  });
});

describe('change email', () => {
  it('changes the email only after the old address approves and the new one confirms', async () => {
    const { agent, email } = await newUser('mover');
    const newEmail = uniqueEmail('moved');

    await agent
      .post('/api/auth/change-email')
      .send({ newEmail, callbackURL: '/account/security' })
      .expect(200);
    // Step 1: only the current address hears about it, and nothing has changed yet.
    expect(t.emails.to(newEmail)).toHaveLength(0);
    expect(t.emails.to(email).at(-1)?.text).toContain(newEmail);
    expect((await me(agent)).user.email).toBe(email);

    // Step 2: approving from the old address sends a confirmation to the new one.
    await agent.get(t.emails.lastLinkTo(email)).expect(302);
    expect((await me(agent)).user.email).toBe(email);

    // Step 3: confirming the new address makes the change.
    await agent.get(t.emails.lastLinkTo(newEmail)).expect(302);
    expect((await me(agent)).user).toMatchObject({ email: newEmail, emailVerified: true });
    expect(await signInStatus(newEmail, TEST_PASSWORD)).toBe(200);
    expect(await signInStatus(email, TEST_PASSWORD)).toBe(401);
  });

  it("does not reveal or touch another account's email", async () => {
    const { agent, email } = await newUser('curious');
    const taken = await newUser('taken');
    const sentBefore = t.emails.sent.length;

    const res = await agent.post('/api/auth/change-email').send({ newEmail: taken.email });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: true });
    expect(t.emails.sent.length).toBe(sentBefore);
    expect((await me(agent)).user.email).toBe(email);
    expect((await me(taken.agent)).user.email).toBe(taken.email);
  });

  it('refuses the approval link in a browser signed in as someone else', async () => {
    const { agent, email } = await newUser('target');
    const intruder = await newUser('intruder');
    await agent.post('/api/auth/change-email').send({ newEmail: uniqueEmail('elsewhere') });

    const res = await intruder.agent.get(t.emails.lastLinkTo(email)).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=INVALID_USER');
  });
});

describe('resend verification email', () => {
  it('answers the same for unknown and unverified emails', async () => {
    const unverified = uniqueEmail('pending');
    await browser(t.server)
      .post('/api/auth/sign-up/email')
      .send({ name: 'Pending', email: unverified, password: TEST_PASSWORD })
      .expect(200);
    const unknown = uniqueEmail('ghost');

    const send = (email: string) =>
      browser(t.server).post('/api/auth/send-verification-email').send({ email });
    const a = await send(unverified);
    const b = await send(unknown);

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(b.body).toEqual(a.body);
    expect(t.emails.to(unverified)).toHaveLength(2);
    expect(t.emails.to(unknown)).toHaveLength(0);
  });
});

describe('sign-up with an email that already has an account', () => {
  it('answers like a new sign-up and tells the real owner instead', async () => {
    const { email } = await newUser('existing');
    const fresh = uniqueEmail('fresh');
    const signUp = (address: string) =>
      browser(t.server)
        .post('/api/auth/sign-up/email')
        .send({ name: 'Someone', email: address, password: 'an attacker chosen password' });

    const forNew = await signUp(fresh).expect(200);
    const forExisting = await signUp(email).expect(200);

    const shape = (body: { token: unknown; user: Record<string, unknown> }) => ({
      token: body.token,
      userKeys: Object.keys(body.user).sort(),
      emailVerified: body.user.emailVerified,
    });
    expect(shape(forExisting.body as never)).toEqual(shape(forNew.body as never));
    expect(t.emails.to(email).at(-1)?.subject).toMatch(/already have/i);
    expect(await signInStatus(email, TEST_PASSWORD)).toBe(200);
  });
});

describe('profile', () => {
  it('updates the name', async () => {
    const { agent } = await newUser('renamer');
    await agent.post('/api/auth/update-user').send({ name: '  Ada Lovelace ' }).expect(200);
    expect((await me(agent)).user.name).toBe('Ada Lovelace');
  });

  it.each([
    { name: '   ' },
    { name: 'x'.repeat(101) },
    { image: 'javascript:alert(1)' },
    { image: 'http://tracker.example/pixel.png' },
  ])('rejects invalid profile input %o', async (body) => {
    const { agent } = await newUser('invalid');
    const res = await agent.post('/api/auth/update-user').send(body).expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_PROFILE' });
  });

  it('rejects a blank name at sign-up', async () => {
    await browser(t.server)
      .post('/api/auth/sign-up/email')
      .send({ name: ' ', email: uniqueEmail('blank'), password: TEST_PASSWORD })
      .expect(400);
  });

  it('cannot change the email or its verified flag without the email flow', async () => {
    const { agent, email } = await newUser('sneaky');
    await agent
      .post('/api/auth/update-user')
      .send({ email: uniqueEmail('hijack') })
      .expect(400);
    await agent.post('/api/auth/update-user').send({ emailVerified: false });
    expect((await me(agent)).user).toMatchObject({ email, emailVerified: true });
  });
});

describe('sessions', () => {
  async function latestSessionToken(email: string): Promise<string> {
    const result = await owner.db.execute<{ token: string }>(sql`
      select s.token from sessions s join users u on u.id = s.user_id
      where u.email = ${email} order by s.created_at desc limit 1
    `);
    return result.rows[0]?.token ?? '';
  }

  it('lists the signed-in devices and revokes one of them', async () => {
    const { agent, email } = await newUser('devices');
    const laptop = await signIn(t.server, email);
    const laptopToken = await latestSessionToken(email);

    const list = await agent.get('/api/auth/list-sessions').expect(200);
    expect((list.body as unknown[]).length).toBe(2);

    await agent.post('/api/auth/revoke-session').send({ token: laptopToken }).expect(200);
    await laptop.get('/api/me').expect(401);
    await agent.get('/api/me').expect(200);
  });

  it("cannot revoke another user's session", async () => {
    const victim = await newUser('victim');
    const victimToken = await latestSessionToken(victim.email);
    const attacker = await newUser('attacker');

    await attacker.agent.post('/api/auth/revoke-session').send({ token: victimToken });
    await victim.agent.get('/api/me').expect(200);
  });

  it('signs out every other device', async () => {
    const { agent, email } = await newUser('everywhere');
    const phone = await signIn(t.server, email);
    const tablet = await signIn(t.server, email);

    await agent.post('/api/auth/revoke-other-sessions').send({}).expect(200);
    await phone.get('/api/me').expect(401);
    await tablet.get('/api/me').expect(401);
    await agent.get('/api/me').expect(200);
  });
});

describe('delete account', () => {
  /** Asks for deletion and returns the token from the confirmation email. */
  async function requestDeletion(agent: Agent, email: string): Promise<string> {
    const res = await agent.post('/api/auth/delete-user').send({}).expect(200);
    expect(res.body).toMatchObject({ message: 'Verification email sent' });
    const link = t.emails.lastLinkTo(email);
    expect(link).toMatch(/^\/account\/delete\?token=/);
    return queryParam(link, 'token');
  }

  it('deletes only after the emailed confirmation, while signed in', async () => {
    const { agent, email } = await newUser('leaver');
    const token = await requestDeletion(agent, email);
    expect(await userCount(email)).toBe(1);

    await browser(t.server).post('/api/auth/delete-user').send({ token }).expect(401);
    await agent.post('/api/auth/delete-user').send({ token }).expect(200);

    expect(await userCount(email)).toBe(0);
    await agent.get('/api/me').expect(401);
    expect(await signInStatus(email, TEST_PASSWORD)).toBe(401);
  });

  it('never deletes on the password alone', async () => {
    const { agent, email } = await newUser('password-only');
    const res = await agent
      .post('/api/auth/delete-user')
      .send({ password: TEST_PASSWORD })
      .expect(200);
    expect(res.body).toMatchObject({ message: 'Verification email sent' });
    expect(await userCount(email)).toBe(1);
  });

  it("refuses someone else's confirmation token", async () => {
    const { agent, email } = await newUser('owner-of-token');
    const token = await requestDeletion(agent, email);
    const other = await newUser('other');

    await other.agent.post('/api/auth/delete-user').send({ token }).expect(404);
    expect(await userCount(email)).toBe(1);
    expect(await userCount(other.email)).toBe(1);
  });

  it('is refused while the user is the only owner of a workspace', async () => {
    const { agent, email } = await newUser('sole');
    await createWorkspace(agent, 'Solo Research', uniqueSlug('solo'));
    const emailsBefore = t.emails.to(email).length;

    const res = await agent.post('/api/auth/delete-user').send({}).expect(400);
    expect(res.body).toMatchObject({ code: 'SOLE_WORKSPACE_OWNER' });
    expect((res.body as { message: string }).message).toContain('Solo Research');
    expect(t.emails.to(email)).toHaveLength(emailsBefore);
  });

  it('checks ownership again when the deletion is confirmed', async () => {
    const { agent, email } = await newUser('late-owner');
    const token = await requestDeletion(agent, email);
    await createWorkspace(agent, 'Created Later', uniqueSlug('later'));

    const res = await agent.post('/api/auth/delete-user').send({ token }).expect(400);
    expect(res.body).toMatchObject({ code: 'SOLE_WORKSPACE_OWNER' });
    expect(await userCount(email)).toBe(1);
  });

  it("removes a co-owner's memberships and keeps the workspace and its audit trail", async () => {
    const first = await newUser('first-owner');
    const tenantId = await createWorkspace(first.agent, 'Shared', uniqueSlug('shared'));
    const coOwnerEmail = uniqueEmail('co-owner');
    await first.agent
      .post('/api/auth/organization/invite-member')
      .send({ email: coOwnerEmail, role: 'owner' })
      .expect(200);
    const invitationId = t.emails.lastLinkTo(coOwnerEmail).split('/').at(-1);
    const coOwner = await signUpVerified(t.server, t.emails, coOwnerEmail);
    await coOwner
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId })
      .expect(200);

    const { id: userId } = (await me(coOwner)).user;
    await owner.db.execute(sql`
      with g as (insert into groups (tenant_id, name) values (${tenantId}, 'Reviewers') returning id)
      insert into group_members (tenant_id, group_id, user_id) select ${tenantId}, id, ${userId} from g
    `);
    await owner.db.execute(sql`
      insert into audit_log (tenant_id, actor_user_id, action, target_type)
      values (${tenantId}, ${userId}, 'test.action', 'test')
    `);

    const token = await requestDeletion(coOwner, coOwnerEmail);
    await coOwner.post('/api/auth/delete-user').send({ token }).expect(200);

    const counts = await owner.db.execute<{
      memberships: number;
      groups: number;
      audit: number;
    }>(sql`
      select
        (select count(*)::int from memberships where tenant_id = ${tenantId}) as memberships,
        (select count(*)::int from group_members where user_id = ${userId}) as groups,
        (select count(*)::int from audit_log where tenant_id = ${tenantId} and actor_user_id is null) as audit
    `);
    expect(counts.rows[0]).toEqual({ memberships: 1, groups: 0, audit: 1 });
    await first.agent.get('/api/me').expect(200);
  });
});

describe('social sign-in', () => {
  it('lists no providers when no OAuth app is configured', async () => {
    const res = await browser(t.server).get('/api/auth-providers').expect(200);
    expect(res.body).toEqual({ socialProviders: [] });
  });

  it('refuses to start sign-in with a provider that is not configured', async () => {
    const res = await browser(t.server)
      .post('/api/auth/sign-in/social')
      .send({ provider: 'github', callbackURL: '/' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('cannot remove the last way to sign in', async () => {
    const { agent } = await newUser('only-password');
    const accounts = (await agent.get('/api/auth/list-accounts').expect(200)).body as {
      id: string;
      providerId: string;
    }[];
    expect(accounts.map((a) => a.providerId)).toEqual(['credential']);

    const res = await agent
      .post('/api/auth/unlink-account')
      .send({ accountId: accounts[0]?.id })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'FAILED_TO_UNLINK_LAST_ACCOUNT' });
  });

  describe('with Google and GitHub configured', () => {
    let social: TestApp;

    beforeAll(async () => {
      social = await createTestApp({
        env: testApiEnv({
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-client-secret',
          GITHUB_CLIENT_ID: 'github-client-id',
          GITHUB_CLIENT_SECRET: 'github-client-secret',
        }),
      });
    });

    afterAll(async () => {
      await social.app.close();
    });

    it('lists both providers', async () => {
      const res = await browser(social.server).get('/api/auth-providers').expect(200);
      expect(res.body).toEqual({ socialProviders: ['google', 'github'] });
    });

    it.each([
      ['google', 'https://accounts.google.com/'],
      ['github', 'https://github.com/login/oauth/authorize'],
    ])('sends %s sign-in back to the public callback URL', async (provider, authorizeUrl) => {
      const res = await browser(social.server)
        .post('/api/auth/sign-in/social')
        .send({ provider, callbackURL: '/' })
        .expect(200);
      const url = new URL((res.body as { url: string }).url);
      expect(url.href.startsWith(authorizeUrl)).toBe(true);
      expect(url.searchParams.get('redirect_uri')).toBe(
        `http://localhost:3000/api/auth/callback/${provider}`,
      );
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('refuses an off-site callback URL', async () => {
      await browser(social.server)
        .post('/api/auth/sign-in/social')
        .send({ provider: 'github', callbackURL: 'https://evil.example/' })
        .expect(403);
    });
  });
});

describe('active workspace of a new session', () => {
  const setActive = (agent: Agent, organizationId: string) =>
    agent.post('/api/auth/organization/set-active').send({ organizationId }).expect(200);

  /** A user with two workspaces; the second (newer) one is active. */
  async function userWithTwoWorkspaces() {
    const { agent, email } = await newUser('two-spaces');
    const first = await createWorkspace(agent, 'First', uniqueSlug('first'));
    const second = await createWorkspace(agent, 'Second', uniqueSlug('second'));
    await setActive(agent, second);
    return { agent, email, first, second };
  }

  it('keeps the workspace after a password change signs out other devices', async () => {
    const { agent, second } = await userWithTwoWorkspaces();
    await agent
      .post('/api/auth/change-password')
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      })
      .expect(200);
    expect((await me(agent)).activeWorkspace?.id).toBe(second);
  });

  it('starts a fresh sign-in in the workspace used most recently', async () => {
    const { agent, email, first } = await userWithTwoWorkspaces();
    await setActive(agent, first);
    const laptop = await signIn(t.server, email);
    expect((await me(laptop)).activeWorkspace?.id).toBe(first);
  });

  it('starts an invited member in the workspace they joined', async () => {
    const inviter = await newUser('inviter');
    const tenantId = await createWorkspace(inviter.agent, 'Joined', uniqueSlug('joined'));
    const memberEmail = uniqueEmail('joiner');
    await inviter.agent
      .post('/api/auth/organization/invite-member')
      .send({ email: memberEmail, role: 'viewer' })
      .expect(200);
    const invitationId = t.emails.lastLinkTo(memberEmail).split('/').at(-1);
    const member = await signUpVerified(t.server, t.emails, memberEmail);
    await member
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId })
      .expect(200);

    const phone = await signIn(t.server, memberEmail);
    expect((await me(phone)).activeWorkspace).toMatchObject({ id: tenantId, role: 'viewer' });
  });

  it('never starts in a workspace the user is no longer a member of', async () => {
    const { agent, email, first, second } = await userWithTwoWorkspaces();
    const { id: userId } = (await me(agent)).user;
    await owner.db.execute(
      sql`delete from memberships where tenant_id = ${second} and user_id = ${userId}`,
    );
    const laptop = await signIn(t.server, email);
    expect((await me(laptop)).activeWorkspace?.id).toBe(first);
  });

  it('starts with no workspace when the user has none', async () => {
    const { email } = await newUser('no-space');
    expect((await me(await signIn(t.server, email))).activeWorkspace).toBeNull();
  });
});
