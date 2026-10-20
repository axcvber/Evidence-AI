import { HttpStatus } from '@nestjs/common';

/**
 * Base for errors that carry their own HTTP mapping. The message is shown to the client, so
 * it must be safe to expose. DomainExceptionFilter turns these into
 * `{ statusCode, code, message }` responses.
 */
export abstract class DomainError extends Error {
  abstract readonly status: HttpStatus;
  abstract readonly code: string;
}
