'use client';

import { MIN_PASSWORD_LENGTH } from '@evidence/shared';
import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';

function InvalidLink() {
  return (
    <AuthCard
      title="This link no longer works"
      description="Reset links work once and expire after an hour."
      footer={<Link href="/login">Back to sign in</Link>}
    >
      <Button asChild className="w-full">
        <Link href="/forgot-password">Send a new link</Link>
      </Button>
    </AuthCard>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(token === null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const newPassword = formText(form, 'password');
    if (newPassword !== formText(form, 'confirm')) {
      setError("The passwords don't match.");
      return;
    }
    setPending(true);
    setError('');
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (!error) setDone(true);
    else if (error.code === 'INVALID_TOKEN') setInvalid(true);
    else setError(error.message ?? 'Could not reset the password');
  }

  if (invalid) return <InvalidLink />;
  if (done) {
    return (
      <AuthCard
        title="Password changed"
        description="You were signed out on every device. Sign in with your new password."
      >
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
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
        <div className="space-y-2">
          <Label htmlFor="confirm">Repeat it</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            autoComplete="new-password"
          />
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={pending}>
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}
