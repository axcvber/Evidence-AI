import { z } from 'zod';
import { socialProviderIds } from '../account.js';
import { defineEndpoint } from './define.js';

export const authProvidersResponseSchema = z.object({
  /** Social providers whose OAuth app is configured on the API, in display order. */
  socialProviders: z.array(z.enum(socialProviderIds)),
});

export type AuthProvidersResponse = z.output<typeof authProvidersResponseSchema>;

export const getAuthProviders = defineEndpoint({
  method: 'GET',
  path: '/auth-providers',
  summary: 'Sign-in methods available besides email and password',
  response: authProvidersResponseSchema,
});
