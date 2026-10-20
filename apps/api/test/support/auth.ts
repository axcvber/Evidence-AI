import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { MemoryEmailSender } from './memory-email-sender.js';
import { TEST_WEB_ORIGIN } from './env.js';

export const TEST_PASSWORD = 'correct horse battery staple';

export type Agent = ReturnType<typeof request.agent>;

/** A random client IP, so each simulated browser gets its own auth rate-limit budget. */
export function randomClientIp(): string {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** A cookie-keeping client that sends the web origin, like a browser behind the Next proxy. */
export function browser(server: Server): Agent {
  return request
    .agent(server)
    .set('Origin', TEST_WEB_ORIGIN)
    .set('X-Forwarded-For', randomClientIp());
}

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

export function uniqueSlug(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

/** Signs up, follows the verification link from the email, and returns a signed-in agent. */
export async function signUpVerified(
  server: Server,
  emails: MemoryEmailSender,
  email: string,
  name = 'Test User',
): Promise<Agent> {
  const agent = browser(server);
  await agent
    .post('/api/auth/sign-up/email')
    .send({ name, email, password: TEST_PASSWORD })
    .expect(200);

  // autoSignInAfterVerification: following the link sets the session cookie.
  await agent.get(emails.lastLinkTo(email)).expect((res) => {
    if (res.status >= 400) throw new Error(`Verification failed: ${res.status} ${res.text}`);
  });
  return agent;
}

/** A fresh browser signed in with email and password. */
export async function signIn(
  server: Server,
  email: string,
  password = TEST_PASSWORD,
): Promise<Agent> {
  const agent = browser(server);
  await agent.post('/api/auth/sign-in/email').send({ email, password }).expect(200);
  return agent;
}

export async function createWorkspace(agent: Agent, name: string, slug: string): Promise<string> {
  const res = await agent.post('/api/auth/organization/create').send({ name, slug }).expect(200);
  return (res.body as { id: string }).id;
}

type Getter = (path: string) => request.Test;

/**
 * The user gets no access to the active workspace: /api/me reports none, and a tenant route
 * fails closed. Used for stale, tampered or revoked memberships.
 */
export async function expectNoWorkspaceAccess(get: Getter): Promise<void> {
  const me = await get('/api/me').expect(200);
  if ((me.body as { activeWorkspace: unknown }).activeWorkspace !== null) {
    throw new Error('Expected no active workspace');
  }
  const res = await get('/api/dev-mocks/documents').expect(403);
  if ((res.body as { code?: string }).code !== 'NO_ACTIVE_WORKSPACE') {
    throw new Error(`Expected NO_ACTIVE_WORKSPACE, got ${JSON.stringify(res.body)}`);
  }
}
