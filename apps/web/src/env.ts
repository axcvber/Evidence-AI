import { parseEnv } from '@evidence/shared';
import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

const serverSchema = z.object({
  API_URL: httpUrl,
});

const clientSchema = z.object({
  NEXT_PUBLIC_API_URL: httpUrl,
});

export type WebServerEnv = z.output<typeof serverSchema>;
export type WebClientEnv = z.output<typeof clientSchema>;

/** Server-only variables. Never import the result into client components. */
export function getServerEnv(): WebServerEnv {
  return parseEnv(serverSchema, process.env);
}

/** NEXT_PUBLIC_* values must be referenced literally so Next can inline them into the client bundle. */
export function getClientEnv(): WebClientEnv {
  return parseEnv(clientSchema, { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });
}

/** Called from next.config.ts so `next dev` and `next build` fail fast on bad config. */
export function validateWebEnv(): void {
  getServerEnv();
  getClientEnv();
}
