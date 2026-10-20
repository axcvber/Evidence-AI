import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KEEP_ALIVE_TIMEOUT_MS } from '../src/app.setup.js';
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

  it('keeps idle connections open longer than a 60s load balancer idle timeout', () => {
    expect(KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(t.server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(t.server.headersTimeout).toBeGreaterThan(KEEP_ALIVE_TIMEOUT_MS);
  });
});
