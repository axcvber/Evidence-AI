import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends IncomingMessage {
  requestId?: string;
}

// Accept a caller's ID only if it is short and plain, so it can't inject into logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request an ID (the caller's, if safe, otherwise a new one), returns it in the
 * `x-request-id` response header and makes it available for error bodies and logs.
 */
export function requestIdMiddleware(
  req: RequestWithId,
  res: ServerResponse,
  next: () => void,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
