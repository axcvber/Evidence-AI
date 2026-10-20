'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';

export function SignupForm({ next }: { next: string }) {
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
      // Where the verification link lands after the email is confirmed.
      callbackURL: next === '/' ? '/onboarding' : next,
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
            minLength={12}
            required
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">At least 12 characters.</p>
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={pending}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
