import { parseEnv } from '@evidence/shared';
import { z } from 'zod';

const serverSchema = z.object({
  // Where Next forwards /api/* (server-side only; the browser always calls same-origin /api).
  API_URL: z.url({ protocol: /^https?$/ }),
});

export type WebServerEnv = z.output<typeof serverSchema>;

/** Server-only variables. Never import the result into client components. */
export function getServerEnv(): WebServerEnv {
  return parseEnv(serverSchema, process.env);
}
