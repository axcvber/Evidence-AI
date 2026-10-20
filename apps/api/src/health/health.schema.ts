import { z } from 'zod';

export const healthResponseSchema = z.object({ status: z.literal('ok') });

export type HealthResponse = z.output<typeof healthResponseSchema>;

const checkStatus = z.enum(['ok', 'error']);

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.object({ database: checkStatus, redis: checkStatus }),
});

export type ReadinessResponse = z.output<typeof readinessResponseSchema>;
