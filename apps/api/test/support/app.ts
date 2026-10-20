import 'reflect-metadata';
import { Server } from 'node:http';
import { Type } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ApiEnv } from '../../src/env.js';
import { MemoryEmailSender } from './memory-email-sender.js';
import { testApiEnv } from './env.js';

export interface TestApp {
  app: NestExpressApplication;
  server: Server;
  emails: MemoryEmailSender;
  env: ApiEnv;
}

/** Builds the API exactly like main.ts does, with emails captured in memory. */
export async function createTestApp(
  options: { docs?: boolean; controllers?: Type[]; env?: ApiEnv; emails?: MemoryEmailSender } = {},
): Promise<TestApp> {
  const emails = options.emails ?? new MemoryEmailSender();
  const env = options.env ?? testApiEnv();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ env, emailSender: emails })],
    controllers: options.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, { docs: options.docs ?? false });
  await app.listen(0);
  return { app, server: app.getHttpServer(), emails, env };
}
