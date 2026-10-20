import type { Database } from '@evidence/db';
import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Public } from '../auth/public.decorator.js';
import { DATABASE } from '../database/database.module.js';
import { REDIS } from '../redis/redis.module.js';
import type { HealthResponse, ReadinessResponse } from './health.schema.js';
import { healthResponseSchema, readinessResponseSchema } from './health.schema.js';

async function probe(check: () => Promise<unknown>): Promise<'ok' | 'error'> {
  try {
    await check();
    return 'ok';
  } catch {
    return 'error';
  }
}

@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: the process is up' })
  @ApiOkResponse({ description: 'The API process is up', standardSchema: healthResponseSchema })
  check(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: Postgres and Redis are reachable' })
  @ApiOkResponse({ description: 'Ready to serve traffic', standardSchema: readinessResponseSchema })
  @ApiServiceUnavailableResponse({
    description: 'A dependency is down',
    standardSchema: readinessResponseSchema,
  })
  async ready(): Promise<ReadinessResponse> {
    // `select 1` touches no tenant data, so it runs outside a tenant transaction.
    const [database, redis] = await Promise.all([
      probe(() => this.db.execute(sql`select 1`)),
      probe(() => this.redis.ping()),
    ]);
    const result: ReadinessResponse = {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'unavailable',
      checks: { database, redis },
    };
    if (result.status !== 'ok') throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
