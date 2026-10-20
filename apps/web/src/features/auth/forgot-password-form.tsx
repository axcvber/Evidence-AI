'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';

export function ForgotPasswordForm() {
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = formText(new FormData(event.currentTarget), 'email');
    setPending(true);
    setError('');
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? 'Too many requests. Wait a minute and try again.'
          : (error.message ?? 'Could not send the link'),
      );
    } else setSentTo(email);
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            If <strong>{sentTo}</strong> has an account, we sent it a link to choose a new password.
            The link works once, within an hour.
          </>
        }
        footer={<Link href="/login">Back to sign in</Link>}
      >
        {null}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to choose a new one."
      footer={<Link href="/login">Back to sign in</Link>}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={pending}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
