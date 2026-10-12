import { parseEnv, ServerEnv, serverEnvSchema } from '@evidence/shared';

export type WorkerEnv = ServerEnv;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parseEnv(serverEnvSchema, source);
}
