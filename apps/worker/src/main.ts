import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadWorkerEnv } from './env.js';
import { WorkerModule } from './worker.module.js';

// Until BullMQ workers hold open Redis connections, nothing keeps the event loop alive,
// so the process waits explicitly for a shutdown signal.
function waitForShutdownSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const keepAlive = setInterval(() => undefined, 60_000);
    const stop = (signal: NodeJS.Signals): void => {
      clearInterval(keepAlive);
      resolve(signal);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

async function bootstrap(): Promise<void> {
  loadWorkerEnv();

  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger('Worker');
  logger.log('Worker ready');

  const signal = await waitForShutdownSignal();
  logger.log(`Received ${signal}, shutting down`);
  await app.close();
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
