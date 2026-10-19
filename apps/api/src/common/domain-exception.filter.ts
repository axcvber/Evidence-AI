import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { MissingTenantContextError } from '../tenancy/tenant-db.js';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

/** Maps typed domain errors to HTTP responses. Anything not listed keeps Nest's default handling. */
@Catch(MissingTenantContextError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(_error: MissingTenantContextError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<JsonResponse>().status(HttpStatus.FORBIDDEN).json({
      statusCode: HttpStatus.FORBIDDEN,
      code: 'NO_ACTIVE_WORKSPACE',
      message: 'Select a workspace to continue',
    });
  }
}
