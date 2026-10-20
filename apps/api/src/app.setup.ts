import { IncomingMessage, ServerResponse } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { Auth, AUTH_BASE_PATH } from './auth/auth.js';
import { AUTH } from './auth/auth.tokens.js';
import { requestIdMiddleware } from './common/request-id.js';
import { setupApiDocs } from './docs/api-docs.js';

export const API_PREFIX = 'api';
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;

/** The part of the Express app we use, typed without depending on express directly. */
interface RawRouter {
  all(path: string, handler: (req: IncomingMessage, res: ServerResponse) => unknown): void;
}

export interface ConfigureAppOptions {
  docs: boolean;
}

/**
 * HTTP setup shared by main.ts and the integration tests. The app must be created with
 * `bodyParser: false`: Better Auth reads the raw request body, so its handler is mounted
 * before the JSON parser that the rest of the API uses.
 */
export function configureApp(app: NestExpressApplication, options: ConfigureAppOptions): void {
  const auth = app.get<Auth>(AUTH);
  // First, so Better Auth's routes get request IDs too.
  app.use(requestIdMiddleware);
  (app.getHttpAdapter().getInstance() as RawRouter).all(
    `${AUTH_BASE_PATH}/*splat`,
    toNodeHandler(auth),
  );
  app.useBodyParser('json', { limit: '1mb' });

  // Keep idle connections open longer than the proxy in front (the Next proxy locally, the
  // load balancer's 60s idle timeout in production). With Node's 5s default, the proxy can
  // reuse a connection the API is closing at that moment, and the request fails ECONNRESET.
  const server = app.getHttpServer() as { keepAliveTimeout: number; headersTimeout: number };
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;

  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  if (options.docs) setupApiDocs(app);
}
