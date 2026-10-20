import { parseEnv, serverEnvSchema } from '@evidence/shared';
import { z } from 'zod';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const httpUrl = z.url({ protocol: /^https?$/ });

// `address@domain` or `Display Name <address@domain>`; the domain must be verified in Resend.
const emailSender = z.string().refine((value) => {
  const address = /^[^<>]*<([^<>]+)>$/.exec(value.trim())?.[1] ?? value.trim();
  return z.email().safeParse(address).success;
}, 'Use "address@domain" or "Name <address@domain>"');

export const apiEnvSchema = serverEnvSchema
  .extend({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // Swagger UI exposes the full API surface, so it is off in production unless enabled explicitly.
    API_DOCS_ENABLED: z.stringbool().optional(),
    // Canned /api/dev-mocks/* endpoints for features from later phases; never in production.
    DEV_MOCKS_ENABLED: z.stringbool().optional(),

    // Better Auth connects as evidence_auth: auth tables only (see packages/db/src/schema/rls.ts).
    AUTH_DATABASE_URL: postgresUrl,
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public origin the browser uses. The web app proxies /api/* to this API, so it is the web origin.
    BETTER_AUTH_URL: httpUrl,

    // Sessions and auth rate limits live in Redis under this prefix.
    AUTH_REDIS_KEY_PREFIX: z.string().min(1).default('evidence:auth:'),
    // Rate limiting of /api/auth/* is on everywhere except tests, and cannot be turned off in production.
    AUTH_RATE_LIMIT_ENABLED: z.stringbool().optional(),
    // Header carrying the client IP for rate limits and session records, and the proxy hops
    // that may appear in it (comma-separated IPs or CIDRs). Both are set explicitly in
    // production, where the header depends on the load balancer in front of the API.
    CLIENT_IP_HEADER: z.string().min(1).optional(),
    TRUSTED_PROXIES: z
      .string()
      .optional()
      .transform((value) =>
        value
          ?.split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),

    RESEND_API_KEY: z.string().startsWith('re_').optional(),
    EMAIL_FROM: emailSender,
  })
  .superRefine((env, ctx) => {
    // Without a key, emails are only logged; that must never happen in production.
    if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Required in production',
      });
    }
    if (env.NODE_ENV === 'production' && !env.CLIENT_IP_HEADER) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLIENT_IP_HEADER'],
        message: 'Required in production (the header your load balancer sets)',
      });
    }
    if (env.NODE_ENV === 'production' && env.DEV_MOCKS_ENABLED === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_MOCKS_ENABLED'],
        message: 'Dev mocks cannot run in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.AUTH_RATE_LIMIT_ENABLED === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_RATE_LIMIT_ENABLED'],
        message: 'Cannot be disabled in production',
      });
    }
  });

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}

export function apiDocsEnabled(env: Pick<ApiEnv, 'NODE_ENV' | 'API_DOCS_ENABLED'>): boolean {
  return env.API_DOCS_ENABLED ?? env.NODE_ENV !== 'production';
}

export function authRateLimitEnabled(
  env: Pick<ApiEnv, 'NODE_ENV' | 'AUTH_RATE_LIMIT_ENABLED'>,
): boolean {
  return env.AUTH_RATE_LIMIT_ENABLED ?? env.NODE_ENV !== 'test';
}

export function devMocksEnabled(env: Pick<ApiEnv, 'NODE_ENV' | 'DEV_MOCKS_ENABLED'>): boolean {
  return env.NODE_ENV !== 'production' && (env.DEV_MOCKS_ENABLED ?? true);
}
