import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { API_DOCS_PATH, setupApiDocs } from './docs/api-docs.js';
import { apiDocsEnabled, loadApiEnv } from './env.js';

async function bootstrap(): Promise<void> {
  // Validate before anything else so a misconfigured deploy fails at startup, not on first use.
  const env = loadApiEnv();

  const app = await NestFactory.create(AppModule.register({ databaseUrl: env.DATABASE_URL }));
  app.enableShutdownHooks();
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  const docsEnabled = apiDocsEnabled(env);
  if (docsEnabled) setupApiDocs(app);

  await app.listen(env.PORT);
  if (docsEnabled) {
    new Logger('ApiDocs').log(`Swagger UI on http://localhost:${env.PORT}/${API_DOCS_PATH}`);
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
