'use client';

import type { SocialProviderId } from '@evidence/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { FormError } from './auth-card';

export const providerLabels: Record<SocialProviderId, string> = {
  google: 'Google',
  github: 'GitHub',
};

/** Error codes Better Auth adds to the URL when a social sign-in fails. */
export function socialSignInError(code: string | undefined): string {
  if (!code) return '';
  switch (code) {
    case 'email_not_verified':
      return 'Verify your email address with the provider first, then try again.';
    case 'account_not_linked':
    case 'unable_to_link_account':
      return 'An account with this email already exists. Sign in with your password, then connect the provider under Account → Security.';
    case 'account_already_linked_to_different_user':
      return 'That provider account is already connected to another Evidence AI account.';
    case 'email_does_not_match':
      return 'The provider account uses a different email address from yours.';
    default:
      return 'Signing in with that provider did not work. Try again, or use your email and password.';
  }
}

export function SocialSignIn({
  providers,
  next,
  errorPath,
}: {
  providers: readonly SocialProviderId[];
  next: string;
  /** Where a failed attempt lands, with `?error=<code>` appended. */
  errorPath: string;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState<SocialProviderId | null>(null);
  if (providers.length === 0) return null;

  async function signIn(provider: SocialProviderId) {
    setPending(provider);
    setError('');
    // On success the browser leaves for the provider, so `pending` stays set.
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      newUserCallbackURL: '/onboarding',
      errorCallbackURL: errorPath,
    });
    if (error) {
      setPending(null);
      setError(error.message ?? 'Could not start sign-in');
    }
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending !== null}
          onClick={() => void signIn(provider)}
        >
          Continue with {providerLabels[provider]}
        </Button>
      ))}
      <FormError>{error}</FormError>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
