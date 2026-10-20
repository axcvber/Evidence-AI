import type { DevMockName, EndpointDefinition, WorkspaceRole } from '@evidence/shared';
import { buildPath, can, devMockCapabilities, devMocks } from '@evidence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';
import { Agent, createWorkspace, signUpVerified, uniqueEmail, uniqueSlug } from './support/auth.js';
import { testApiEnv } from './support/env.js';

const roles: WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer'];
const validInput: Record<
  DevMockName,
  { path?: Record<string, string>; query?: object; body?: object }
> = {
  listDocuments: {},
  uploadDocument: { body: { title: 'Q3 report' } },
  deleteDocument: { path: { documentId: '00000000-0000-4000-8000-00000000d0c0' } },
  ask: { body: { question: 'How many vacation days do we get?' } },
  search: { query: { q: 'vacation' } },
  inviteMember: { body: { email: 'new.person@example.test' } },
  createGroup: { body: { name: 'HR' } },
  listEvalRuns: {},
  startEvalRun: {},
  usage: {},
  deleteWorkspace: {},
};

let t: TestApp;
let tenantId: string;
const agents = {} as Record<WorkspaceRole, Agent>;

function call(agent: Agent, name: DevMockName) {
  const contract = devMocks[name];
  const input = validInput[name];
  const url = `/api${buildPath(contract.path, input.path)}`;
  const method = contract.method.toLowerCase() as 'get' | 'post' | 'delete';
  const req = agent[method](url);
  if (input.query) void req.query(input.query);
  return input.body ? req.send(input.body) : req;
}

beforeAll(async () => {
  t = await createTestApp();
  agents.owner = await signUpVerified(t.server, t.emails, uniqueEmail('owner'));
  tenantId = await createWorkspace(agents.owner, 'Mocks', uniqueSlug('mocks'));
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const email = uniqueEmail(role);
    await agents.owner
      .post('/api/auth/organization/invite-member')
      .send({ email, role })
      .expect(200);
    const invitationId = t.emails.lastLinkTo(email).split('/').pop();
    agents[role] = await signUpVerified(t.server, t.emails, email);
    await agents[role]
      .post('/api/auth/organization/accept-invitation')
      .send({ invitationId })
      .expect(200);
    await agents[role]
      .post('/api/auth/organization/set-active')
      .send({ organizationId: tenantId })
      .expect(200);
  }
});

afterAll(async () => {
  await t.app.close();
});

describe('dev mocks enforce the capability matrix', () => {
  const matrix = roles.flatMap((role) =>
    (Object.keys(devMocks) as DevMockName[]).map((name) => ({
      role,
      name,
      allowed: can(role, devMockCapabilities[name]),
    })),
  );

  it.each(matrix)('$role → $name: allowed $allowed', async ({ role, name, allowed }) => {
    const res = await call(agents[role], name);
    if (allowed) {
      expect(res.status).toBe((devMocks[name] as EndpointDefinition).status ?? 200);
    } else {
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    }
  });

  it('requires a session', async () => {
    await request(t.server).get('/api/dev-mocks/documents').expect(401);
  });
});

describe('dev mocks outside development', () => {
  it('are not registered when disabled', async () => {
    const off = await createTestApp({ env: testApiEnv({ DEV_MOCKS_ENABLED: 'false' }) });
    try {
      const owner = await signUpVerified(off.server, off.emails, uniqueEmail('off'));
      await createWorkspace(owner, 'No mocks', uniqueSlug('nomocks'));
      await owner.get('/api/dev-mocks/documents').expect(404);
    } finally {
      await off.app.close();
    }
  });

  it('cannot be enabled in production', () => {
    expect(() =>
      testApiEnv({
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_test',
        CLIENT_IP_HEADER: 'x-forwarded-for',
        DEV_MOCKS_ENABLED: 'true',
      }),
    ).toThrow(/DEV_MOCKS_ENABLED/);
  });
});
