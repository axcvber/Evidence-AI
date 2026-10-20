import { z } from 'zod';
import { defineEndpoint } from './define.js';

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

export const getMe = defineEndpoint({
  method: 'GET',
  path: '/me',
  summary: 'The signed-in user and their active workspace',
  response: meResponseSchema,
});
