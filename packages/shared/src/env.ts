import { z } from 'zod';

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
}

/**
 * Validates environment variables against a Zod schema and throws one error listing every
 * problem. Only variable names and Zod messages are reported, never values, so secrets
 * don't end up in logs.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.output<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  throw new EnvValidationError(`Invalid environment variables:\n${lines.join('\n')}`);
}

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const redisUrl = z.url({ protocol: /^rediss?$/ });
const httpUrl = z.url({ protocol: /^https?$/ });

/** Variables shared by every server-side process (API and worker). */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  S3_ENDPOINT: httpUrl.optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  LANGFUSE_BASE_URL: httpUrl,
  LANGFUSE_PUBLIC_KEY: z.string().startsWith('pk-lf-'),
  LANGFUSE_SECRET_KEY: z.string().startsWith('sk-lf-'),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;
