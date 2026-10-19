import { Server } from 'node:http';
import { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { apiDocsEnabled, ApiEnv } from '../src/env.js';
import { createTestApp, TestApp } from './support/app.js';

let t: TestApp | undefined;

async function startApp({ docs }: { docs: boolean }): Promise<Server> {
  t = await createTestApp({ docs });
  return t.server;
}

afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

describe('API docs', () => {
  it('serves an OpenAPI document that describes the routes', async () => {
    const server = await startApp({ docs: true });
    const response = await request(server).get('/api/docs-json').expect(200);
    const document = response.body as OpenAPIObject;
    const health = document.paths['/api/health']?.get;

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('Evidence AI API');
    expect(health?.operationId).toBe('Health_check');
    expect(document.paths['/api/me']?.get?.operationId).toBe('Me_me');
    // The response schema is generated from the Zod schema in health.schema.ts.
    expect(health?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { status: { type: 'string', enum: ['ok'] } },
            required: ['status'],
            additionalProperties: false,
          },
        },
      },
    });
  });

  it('serves Swagger UI', async () => {
    const server = await startApp({ docs: true });
    const response = await request(server).get('/api/docs').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger');
  });

  it('serves nothing when docs are disabled', async () => {
    const server = await startApp({ docs: false });

    await request(server).get('/api/docs-json').expect(404);
    await request(server).get('/api/docs').expect(404);
  });
});

describe('apiDocsEnabled', () => {
  const base = { NODE_ENV: 'development' } as ApiEnv;

  it('is on outside production and off in production by default', () => {
    expect(apiDocsEnabled(base)).toBe(true);
    expect(apiDocsEnabled({ ...base, NODE_ENV: 'production' })).toBe(false);
  });

  it('follows API_DOCS_ENABLED when set', () => {
    expect(apiDocsEnabled({ ...base, NODE_ENV: 'production', API_DOCS_ENABLED: true })).toBe(true);
    expect(apiDocsEnabled({ ...base, API_DOCS_ENABLED: false })).toBe(false);
  });
});
