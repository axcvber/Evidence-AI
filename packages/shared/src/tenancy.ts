import { z } from 'zod';

/** Who a database transaction acts for. Written into Postgres settings that RLS policies read. */
export const tenantContextSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid().optional(),
});

export type TenantContext = z.output<typeof tenantContextSchema>;

/**
 * Base for every tenant-scoped job payload. Jobs extend it with their own fields, and the
 * worker refuses to run a job whose payload doesn't name a valid tenant.
 */
export const tenantJobPayloadSchema = z.object({
  tenantId: z.uuid(),
  actorUserId: z.uuid().optional(),
});

export type TenantJobPayload = z.output<typeof tenantJobPayloadSchema>;
