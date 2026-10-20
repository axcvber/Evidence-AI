'use client';

import type { SocialProviderId } from '@evidence/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';
import { SocialSignIn, socialSignInError } from './social-sign-in';

export function LoginForm({
  next,
  providers,
  socialError,
}: {
  next: string;
  providers: readonly SocialProviderId[];
  socialError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<ReactNode>(socialSignInError(socialError));
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = formText(form, 'email');
    setPending(true);
    setError('');
    const { error } = await authClient.signIn.email({
      email,
      password: formText(form, 'password'),
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 403 ? (
          <>
            Confirm your email first.{' '}
            <Link
              className="underline"
              href={`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`}
            >
              Send a new link
            </Link>
          </>
        ) : error.status === 429 ? (
          'Too many attempts. Wait a minute and try again.'
        ) : (
          'Email or password is incorrect.'
        ),
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
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
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={pending}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
