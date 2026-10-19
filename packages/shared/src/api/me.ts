import { z } from 'zod';

/** GET /api/me */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
  }),
  activeWorkspace: z
    .object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      role: z.enum(['owner', 'admin', 'editor', 'viewer']),
    })
    .nullable(),
});

export type MeResponse = z.output<typeof meResponseSchema>;
