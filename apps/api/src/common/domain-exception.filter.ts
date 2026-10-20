import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { DomainError } from './domain-error.js';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

/** Maps typed domain errors to HTTP responses. Anything else keeps Nest's default handling. */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<JsonResponse>().status(error.status).json({
      statusCode: error.status,
      code: error.code,
      message: error.message,
    });
  }
}
