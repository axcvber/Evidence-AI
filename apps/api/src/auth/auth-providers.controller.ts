import type { AuthProvidersResponse, SocialProviderId } from '@evidence/shared';
import { getAuthProviders, socialProviderIds } from '@evidence/shared';
import { Controller, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint } from '../contracts/endpoint.decorator.js';
import { SOCIAL_PROVIDERS } from './auth.tokens.js';
import { Public } from './public.decorator.js';

@Public()
@ApiTags('auth')
@Controller()
export class AuthProvidersController {
  constructor(@Inject(SOCIAL_PROVIDERS) private readonly enabled: readonly SocialProviderId[]) {}

  /** Lets the sign-in page show only the buttons that will work. Reveals no credentials. */
  @Endpoint(getAuthProviders)
  providers(): AuthProvidersResponse {
    return { socialProviders: socialProviderIds.filter((id) => this.enabled.includes(id)) };
  }
}
