import { IncomingMessage, ServerResponse } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { Auth, AUTH_BASE_PATH } from './auth/auth.js';
import { AUTH } from './auth/auth.tokens.js';
import { setupApiDocs } from './docs/api-docs.js';

export const API_PREFIX = 'api';

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
  (app.getHttpAdapter().getInstance() as RawRouter).all(
    `${AUTH_BASE_PATH}/*splat`,
    toNodeHandler(auth),
  );
  app.useBodyParser('json', { limit: '1mb' });

  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  if (options.docs) setupApiDocs(app);
}
