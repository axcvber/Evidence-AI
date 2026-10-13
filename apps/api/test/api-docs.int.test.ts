import 'reflect-metadata';
import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApiDocs } from '../src/docs/api-docs.js';
import { apiDocsEnabled, ApiEnv } from '../src/env.js';
import { testEnv } from './support/env.js';

let app: INestApplication<Server> | undefined;

async function startApp({ docs }: { docs: boolean }): Promise<INestApplication<Server>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ databaseUrl: testEnv.TEST_DATABASE_URL })],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  if (docs) setupApiDocs(app);
  await app.init();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('API docs', () => {
  it('serves an OpenAPI document that describes the routes', async () => {
    const server = (await startApp({ docs: true })).getHttpServer();
    const response = await request(server).get('/docs-json').expect(200);
    const document = response.body as OpenAPIObject;
    const health = document.paths['/health']?.get;

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('Evidence AI API');
    expect(health?.operationId).toBe('Health_check');
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
    const server = (await startApp({ docs: true })).getHttpServer();
    const response = await request(server).get('/docs').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger');
  });

  it('serves nothing when docs are disabled', async () => {
    const server = (await startApp({ docs: false })).getHttpServer();

    await request(server).get('/docs-json').expect(404);
    await request(server).get('/docs').expect(404);
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
