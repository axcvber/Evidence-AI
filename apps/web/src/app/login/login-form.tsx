'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SubmitEvent, useState } from 'react';
import { Button, ErrorText, Field } from '../../components/ui';
import { formText } from '../../lib/form-data';
import { authClient } from '../../lib/auth-client';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    const { error } = await authClient.signIn.email({
      email: formText(form, 'email'),
      password: formText(form, 'password'),
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 403
          ? 'Confirm your email first: we sent you a link when you signed up.'
          : 'Email or password is incorrect.',
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>
        Sign in
      </Button>
      <p className="text-sm text-zinc-600">
        New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
      </p>
    </form>
  );
}
