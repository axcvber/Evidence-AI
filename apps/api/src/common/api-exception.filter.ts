import type { ApiErrorBody } from '@evidence/shared';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainError } from './domain-error.js';
import type { RequestWithId } from './request-id.js';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

const codeByStatus: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

function httpExceptionMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return error.message;
}

/**
 * The single place errors become HTTP responses, in one shape for every route:
 * `{ statusCode, code, message, details?, requestId }`. Domain errors carry their own status,
 * code and client-safe message; Nest HTTP errors keep their status; anything else is a 500
 * whose details stay in the server log (with the request ID), never in the response.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const requestId = http.getRequest<RequestWithId>().requestId;
    const body = this.toBody(error);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${body.code} [request ${requestId ?? 'unknown'}]`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    http
      .getResponse<JsonResponse>()
      .status(body.statusCode)
      .json({ ...body, ...(requestId && { requestId }) });
  }

  private toBody(error: unknown): ApiErrorBody {
    if (error instanceof DomainError) {
      return {
        statusCode: error.status,
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      };
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      return {
        statusCode: status,
        code: codeByStatus[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`),
        message: status >= 500 ? 'Something went wrong' : httpExceptionMessage(error),
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    };
  }
}
