import { parseEnv, serverEnvSchema } from '@evidence/shared';
import { z } from 'zod';

export const apiEnvSchema = serverEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url({ protocol: /^https?$/ }),
});

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}
