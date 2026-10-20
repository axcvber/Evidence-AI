'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { AuthCard, FormError } from './auth-card';

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
          : error.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Email or password is incorrect.',
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
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
