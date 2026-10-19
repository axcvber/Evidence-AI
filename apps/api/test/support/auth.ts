import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { MemoryEmailSender } from './memory-email-sender.js';
import { TEST_WEB_ORIGIN } from './env.js';

export const TEST_PASSWORD = 'correct horse battery staple';

export type Agent = ReturnType<typeof request.agent>;

/** A cookie-keeping client that sends the web origin, like a browser behind the Next proxy. */
export function browser(server: Server): Agent {
  return request.agent(server).set('Origin', TEST_WEB_ORIGIN);
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

export async function createWorkspace(agent: Agent, name: string, slug: string): Promise<string> {
  const res = await agent.post('/api/auth/organization/create').send({ name, slug }).expect(200);
  return (res.body as { id: string }).id;
}
