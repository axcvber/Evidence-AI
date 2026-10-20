'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';

const linkErrors: Record<string, string> = {
  TOKEN_EXPIRED: 'That confirmation link has expired.',
  INVALID_TOKEN: "That confirmation link isn't valid.",
  USER_NOT_FOUND: "That confirmation link isn't valid.",
  INVALID_USER: 'That link belongs to a different account than the one signed in here.',
};

export function ResendVerificationForm({
  email,
  next,
  linkError,
}: {
  email: string;
  next: string;
  linkError?: string;
}) {
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = formText(new FormData(event.currentTarget), 'email');
    setPending(true);
    setError('');
    const { error } = await authClient.sendVerificationEmail({
      email: address,
      callbackURL: `/verify-email?next=${encodeURIComponent(next)}`,
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? 'Too many requests. Wait a minute and try again.'
          : (error.message ?? 'Could not send the link'),
      );
    } else setSentTo(address);
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            If <strong>{sentTo}</strong> has an account waiting to be confirmed, we sent it a new
            link.
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
      title="Confirm your email"
      description={
        linkError
          ? `${linkErrors[linkError] ?? "That link didn't work."} Request a new one below.`
          : "We'll send a new confirmation link to your email address."
      }
      footer={<Link href="/login">Back to sign in</Link>}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={email}
          />
        </div>
        <FormError>{error}</FormError>
        <Button type="submit" className="w-full" disabled={pending}>
          Send confirmation link
        </Button>
      </form>
    </AuthCard>
  );
}
