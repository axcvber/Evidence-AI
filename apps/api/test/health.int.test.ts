import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createTestApp, TestApp } from './support/app.js';

describe('GET /api/health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('responds 200 without a session', async () => {
    await request(t.server).get('/api/health').expect(200, { status: 'ok' });
  });
});
