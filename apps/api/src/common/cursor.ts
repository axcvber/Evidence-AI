import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from './domain-error.js';

export class InvalidCursorError extends DomainError {
  override readonly name = 'InvalidCursorError';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly code = 'INVALID_CURSOR';

  constructor() {
    super('The cursor is invalid; start again from the first page');
  }
}

/**
 * Opaque keyset cursors: the sort key values of the last item on a page, as base64url JSON.
 * Clients pass them back unchanged; anything else is a 400.
 */
export function encodeCursor(values: string[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decodeCursor(cursor: string, length: number): string[] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return z.array(z.string()).length(length).parse(parsed);
  } catch {
    throw new InvalidCursorError();
  }
}

/** Splits `limit + 1` fetched rows into a page and the cursor for the next one. */
export function toPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => string[],
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(cursorOf(last)) : null };
}
