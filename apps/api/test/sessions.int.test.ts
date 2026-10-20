import { createDb } from '@evidence/db';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import {
  createWorkspace,
  randomClientIp,
  signUpVerified,
  TEST_PASSWORD,
  uniqueEmail,
  uniqueSlug,
} from './support/auth.js';
import { MemoryEmailSender } from './support/memory-email-sender.js';
import { testApiEnv, testEnv, TEST_WEB_ORIGIN } from './support/env.js';

// Two API instances sharing Postgres and Redis, like two containers behind a load balancer.
const sharedEnv = testApiEnv({ AUTH_RATE_LIMIT_ENABLED: 'true' });
const emails = new MemoryEmailSender();
let a: TestApp;
let b: TestApp;
const owner = createDb(testEnv.TEST_DATABASE_OWNER_URL, { max: 1 });
const redis = new Redis(testEnv.TEST_REDIS_URL);

async function signIn(app: TestApp, email: string, ip = randomClientIp()): Promise<string> {
  const res = await request(app.server)
    .post('/api/auth/sign-in/email')
    .set('Origin', TEST_WEB_ORIGIN)
    .set('X-Forwarded-For', ip)
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  const cookies = res.get('Set-Cookie') ?? [];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

/** The raw session token inside a signed `evidence.session_token` cookie. */
function tokenFrom(cookie: string): string {
  const value = /evidence\.session_token=([^;]+)/.exec(cookie)?.[1] ?? '';
  return decodeURIComponent(value).split('.')[0] ?? '';
}

async function verifiedUser(): Promise<string> {
  const email = uniqueEmail('multi');
  await signUpVerified(a.server, emails, email);
  return email;
}

async function sessionRows(email: string): Promise<number> {
  const result = await owner.db.execute<{ n: number }>(sql`
    select count(*)::int as n from sessions s join users u on u.id = s.user_id where u.email = ${email}
  `);
  return result.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  a = await createTestApp({ env: sharedEnv, emails });
  b = await createTestApp({ env: sharedEnv, emails });
});

afterAll(async () => {
  await Promise.all([a.app.close(), b.app.close()]);
  await owner.pool.end();
  redis.disconnect();
});

describe('sessions shared through Redis', () => {
  it('a session created on one instance works on another', async () => {
    const cookie = await signIn(a, await verifiedUser());
    await request(b.server).get('/api/me').set('Cookie', cookie).expect(200);
  });

  it('signing out on one instance ends the session on every instance', async () => {
    const cookie = await signIn(a, await verifiedUser());
    await request(b.server).get('/api/me').set('Cookie', cookie).expect(200);

    await request(a.server)
      .post('/api/auth/sign-out')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', cookie)
      .expect(200);
    await request(b.server).get('/api/me').set('Cookie', cookie).expect(401);
    await request(a.server).get('/api/me').set('Cookie', cookie).expect(401);
  });

  it('keeps a copy of each session in Postgres and removes it on sign-out', async () => {
    const email = await verifiedUser();
    const before = await sessionRows(email);
    const cookie = await signIn(a, email);
    expect(await sessionRows(email)).toBe(before + 1);

    await request(a.server)
      .post('/api/auth/sign-out')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', cookie)
      .expect(200);
    expect(await sessionRows(email)).toBe(before);
  });

  it('falls back to the Postgres copy when the Redis entry is gone (e.g. after a Redis flush)', async () => {
    const cookie = await signIn(a, await verifiedUser());
    await redis.del(`${sharedEnv.AUTH_REDIS_KEY_PREFIX}${tokenFrom(cookie)}`);

    await request(b.server).get('/api/me').set('Cookie', cookie).expect(200);
  });

  it('still refuses a tampered Postgres copy once it is the one being read', async () => {
    const victim = await signUpVerified(a.server, emails, uniqueEmail('victim'));
    const victimTenant = await createWorkspace(victim, 'Victim', uniqueSlug('victim'));
    const attackerEmail = await verifiedUser();
    const cookie = await signIn(a, attackerEmail);

    await redis.del(`${sharedEnv.AUTH_REDIS_KEY_PREFIX}${tokenFrom(cookie)}`);
    await owner.db.execute(sql`
      update sessions set active_tenant_id = ${victimTenant}
      where token = ${tokenFrom(cookie)}
    `);
    await request(b.server).get('/api/me').set('Cookie', cookie).expect(403);
  });
});

describe('auth rate limits shared through Redis', () => {
  it('counts sign-in attempts from one IP across instances', async () => {
    const email = await verifiedUser();
    const ip = randomClientIp();
    const attempt = (app: TestApp) =>
      request(app.server)
        .post('/api/auth/sign-in/email')
        .set('Origin', TEST_WEB_ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ email, password: 'wrong password, wrong password' });

    // The sign-in rule allows 10 per minute; alternate instances so neither alone reaches it.
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt(i % 2 === 0 ? a : b)).status);

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);

    // Both instances run in this one process, so an in-memory limiter would also look shared.
    // The counter must live in Redis to be shared by separate containers in production.
    const keys = await redis.keys(`${sharedEnv.AUTH_REDIS_KEY_PREFIX}*${ip}*sign-in*`);
    expect(keys).toHaveLength(1);
    expect(Number(await redis.get(keys[0] ?? ''))).toBe(12);

    // Another client is unaffected: limits are per client IP, not global.
    await signIn(b, email, randomClientIp());
  });
});

describe('when Redis is unreachable', () => {
  let broken: TestApp;

  beforeAll(async () => {
    broken = await createTestApp({
      env: { ...sharedEnv, REDIS_URL: 'redis://localhost:6399/0' },
      emails,
    });
  });

  afterAll(async () => {
    await broken.app.close();
  });

  it('fails closed: a valid session cookie is never accepted without Redis', async () => {
    const cookie = await signIn(a, await verifiedUser());
    const res = await request(broken.server).get('/api/me').set('Cookie', cookie);
    expect(res.status).not.toBe(200);
    expect(res.status === 401 || res.status >= 500).toBe(true);
  });

  it('reports not ready', async () => {
    const res = await request(broken.server).get('/api/health/ready').expect(503);
    expect(res.body).toMatchObject({
      status: 'unavailable',
      checks: { database: 'ok', redis: 'error' },
    });
    await request(a.server)
      .get('/api/health/ready')
      .expect(200, { status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });
});
