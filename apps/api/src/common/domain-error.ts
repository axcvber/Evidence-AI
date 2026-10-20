import { HttpStatus } from '@nestjs/common';

/**
 * Base for errors that carry their own HTTP mapping. The message (and `details`, if any) is
 * shown to the client, so it must be safe to expose. ApiExceptionFilter renders these as
 * `{ statusCode, code, message, details?, requestId }`.
 */
export abstract class DomainError extends Error {
  abstract readonly status: HttpStatus;
  abstract readonly code: string;
  readonly details?: unknown;
}
