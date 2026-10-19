'use client';

import Link from 'next/link';
import { SubmitEvent, useState } from 'react';
import { Button, ErrorText, Field } from '../../components/ui';
import { formText } from '../../lib/form-data';
import { authClient } from '../../lib/auth-client';

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
      // Where the verification link lands after confirming the email.
      callbackURL: next === '/' ? '/onboarding' : next,
    });
    setPending(false);
    if (error) setError(error.message ?? 'Could not sign up');
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <p className="text-zinc-700">
        We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish signing up.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <Field label="Name" name="name" required autoComplete="name" />
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field
        label="Password (at least 12 characters)"
        name="password"
        type="password"
        minLength={12}
        required
        autoComplete="new-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        Create account
      </Button>
      <p className="text-sm text-zinc-600">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
      </p>
    </form>
  );
}
