'use client';

import { MIN_PASSWORD_LENGTH, type SocialProviderId } from '@evidence/shared';
import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';
import { SocialSignIn } from './social-sign-in';

export function SignupForm({
  next,
  providers,
}: {
  next: string;
  providers: readonly SocialProviderId[];
}) {
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = formText(form, 'email');
    setPending(true);
    setError('');
    const { error } = await authClient.signUp.email({
      name: formText(form, 'name'),
      email,
      password: formText(form, 'password'),
      // Where the verification link lands; that page continues to `next` or explains an
      // expired link.
      callbackURL: `/verify-email?next=${encodeURIComponent(next)}`,
    });
    setPending(false);
    if (error) setError(error.message ?? 'Could not sign up');
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish signing up.
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Running locally without a Resend key? The link is printed in the API log.
        </p>
        <p className="text-sm text-muted-foreground">
          Nothing arrived?{' '}
          <Link
            className="underline"
            href={`/verify-email?email=${encodeURIComponent(sentTo)}&next=${encodeURIComponent(next)}`}
          >
            Send a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </>
      }
    >
      <SocialSignIn
        providers={providers}
        next={next}
        errorPath={`/login?next=${encodeURIComponent(next)}`}
      />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={pending}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
