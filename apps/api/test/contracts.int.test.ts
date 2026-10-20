import type { ApiErrorBody, ValidatedInput } from '@evidence/shared';
import { cursorQuerySchema, defineEndpoint } from '@evidence/shared';
import { Controller } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../src/auth/public.decorator.js';
import { Endpoint, Input } from '../src/contracts/endpoint.decorator.js';
import { createTestApp, TestApp } from './support/app.js';

const echo = defineEndpoint({
  method: 'POST',
  path: '/contract-probe/items/:itemId',
  summary: 'Echo validated input',
  params: z.object({ itemId: z.uuid() }),
  query: cursorQuerySchema,
  body: z.object({ name: z.string().min(2), tags: z.array(z.string()).max(3).default([]) }),
  response: z.object({
    itemId: z.uuid(),
    limit: z.number(),
    name: z.string(),
    tags: z.array(z.string()),
  }),
  status: 201,
});

const leaky = defineEndpoint({
  method: 'GET',
  path: '/contract-probe/leaky',
  summary: 'Returns more than its contract declares',
  response: z.object({ id: z.string() }),
});

const broken = defineEndpoint({
  method: 'GET',
  path: '/contract-probe/broken',
  summary: 'Returns something that breaks its contract',
  response: z.object({ id: z.uuid() }),
});

const crashing = defineEndpoint({
  method: 'GET',
  path: '/contract-probe/crash',
  summary: 'Throws an unexpected error',
  response: z.object({}),
});

@Public()
@Controller()
class ContractProbeController {
  @Endpoint(echo)
  echo(@Input() { params, query, body }: ValidatedInput<typeof echo>) {
    return { itemId: params.itemId, limit: query.limit, name: body.name, tags: body.tags };
  }

  @Endpoint(leaky)
  leaky() {
    return { id: 'abc', passwordHash: 'never-send-me' };
  }

  @Endpoint(broken)
  broken() {
    return { id: 'not-a-uuid' };
  }

  @Endpoint(crashing)
  crash(): never {
    throw new Error('database password is hunter2');
  }
}

const itemId = '00000000-0000-4000-8000-00000000c0de';
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ controllers: [ContractProbeController], docs: true });
});

afterAll(async () => {
  await t.app.close();
});

describe('@Endpoint input validation', () => {
  it('passes validated input with defaults applied and uses the contract status', async () => {
    const res = await request(t.server)
      .post(`/api/contract-probe/items/${itemId}`)
      .send({ name: 'Ada' })
      .expect(201);
    expect(res.body).toEqual({ itemId, limit: 25, name: 'Ada', tags: [] });
  });

  it('rejects invalid params, query and body together with a 400 listing every problem', async () => {
    const res = await request(t.server)
      .post('/api/contract-probe/items/not-a-uuid?limit=500')
      .send({ name: 'A', tags: ['a', 'b', 'c', 'd'] })
      .expect(400);
    const body = res.body as ApiErrorBody;
    expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    const paths = (body.details as { path: string }[]).map((issue) => issue.path).sort();
    expect(paths).toEqual(['body.name', 'body.tags', 'params.itemId', 'query.limit']);
  });

  it('rejects a missing body', async () => {
    const res = await request(t.server).post(`/api/contract-probe/items/${itemId}`).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects malformed JSON in the same error shape', async () => {
    const res = await request(t.server)
      .post(`/api/contract-probe/items/${itemId}`)
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    expect(res.body).toHaveProperty('requestId');
  });
});

describe('@Endpoint responses', () => {
  it('drops fields the contract does not declare', async () => {
    const res = await request(t.server).get('/api/contract-probe/leaky').expect(200);
    expect(res.body).toEqual({ id: 'abc' });
  });

  it('turns a response that breaks its contract into a 500', async () => {
    const res = await request(t.server).get('/api/contract-probe/broken').expect(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('error shape and request IDs', () => {
  it('hides unexpected error details from the client', async () => {
    const res = await request(t.server).get('/api/contract-probe/crash').expect(500);
    expect(res.body).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('returns a request ID in the header and the error body', async () => {
    const res = await request(t.server).get('/api/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(res.headers['x-request-id']).toBe((res.body as ApiErrorBody).requestId);
  });

  it('keeps a safe caller-supplied request ID and replaces an unsafe one', async () => {
    const safe = await request(t.server).get('/api/health').set('X-Request-Id', 'trace-1234abcd');
    expect(safe.headers['x-request-id']).toBe('trace-1234abcd');

    for (const unsafe of ['has spaces; and=symbols', 'x'.repeat(200)]) {
      const res = await request(t.server).get('/api/health').set('X-Request-Id', unsafe);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('gives Better Auth routes request IDs too', async () => {
    const res = await request(t.server).get('/api/auth/get-session');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('uses the shared shape for guard errors', async () => {
    const res = await request(t.server).get('/api/me').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(res.body).toHaveProperty('requestId');
  });
});

describe('OpenAPI from contracts', () => {
  it('documents params, query, body and the success status from the Zod schemas', async () => {
    const res = await request(t.server).get('/api/docs-json').expect(200);
    const operation = (res.body as OpenAPIObject).paths['/api/contract-probe/items/{itemId}']?.post;

    expect(operation?.summary).toBe('Echo validated input');
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'itemId', in: 'path', required: true }),
        expect.objectContaining({ name: 'limit', in: 'query', required: false }),
      ]),
    );
    expect(operation?.requestBody).toBeDefined();
    expect(operation?.responses).toHaveProperty('201');
    expect(operation?.responses).toHaveProperty('400');
  });

  it("serves Better Auth's own reference when docs are enabled", async () => {
    await request(t.server).get('/api/auth/reference').expect(200);
  });
});
