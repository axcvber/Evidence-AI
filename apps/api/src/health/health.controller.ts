import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from './health.schema.js';
import { healthResponseSchema } from './health.schema.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check for load balancers and uptime monitors' })
  @ApiOkResponse({ description: 'The API process is up', standardSchema: healthResponseSchema })
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
