import { z } from 'zod';

/** Every error response from our API (Better Auth's /api/auth/* routes use their own shape). */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  /** Stable machine-readable code, e.g. VALIDATION_FAILED, INSUFFICIENT_ROLE. */
  code: z.string(),
  /** Safe to show to users. */
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});

export type ApiErrorBody = z.output<typeof apiErrorSchema>;

/** Query for cursor-paginated lists. */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** A page of results; `nextCursor` is null on the last page. */
export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const uuidParam = z.uuid();
