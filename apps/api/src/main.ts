import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { API_DOCS_PATH } from './docs/api-docs.js';
import { apiDocsEnabled, loadApiEnv } from './env.js';

async function bootstrap(): Promise<void> {
  // Validate before anything else so a misconfigured deploy fails at startup, not on first use.
  const env = loadApiEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register({ env }), {
    bodyParser: false,
  });
  const docs = apiDocsEnabled(env);
  configureApp(app, { docs });

  await app.listen(env.PORT);
  if (docs)
    new Logger('ApiDocs').log(`Swagger UI on http://localhost:${env.PORT}/${API_DOCS_PATH}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
