'use client';

import { useState, type SubmitEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';

/** Shown when a change-email link lands back on the security page. */
export type EmailChangeOutcome = 'continued' | 'link-error' | undefined;

export function EmailCard({ email, outcome }: { email: string; outcome: EmailChangeOutcome }) {
  const [error, setError] = useState('');
  const [requested, setRequested] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const newEmail = formText(new FormData(event.currentTarget), 'newEmail');
    setPending(true);
    setError('');
    const { error } = await authClient.changeEmail({
      newEmail,
      callbackURL: '/account/security?email-change=continued',
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? 'Too many requests. Wait a minute and try again.'
          : (error.message ?? 'Could not start the change'),
      );
    } else setRequested(newEmail);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email address</CardTitle>
        <CardDescription>
          You sign in with <strong>{email}</strong>. Changing it takes two confirmations: your
          current address approves, then the new address confirms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome === 'continued' && (
          <Alert>
            <AlertDescription>
              Your sign-in email is now <strong>{email}</strong>. If you just approved a change,
              open the confirmation link we sent to the new address to finish it.
            </AlertDescription>
          </Alert>
        )}
        {outcome === 'link-error' && (
          <Alert variant="destructive">
            <AlertDescription>
              That email change link has expired or isn&apos;t valid. Start the change again.
            </AlertDescription>
          </Alert>
        )}
        {requested ? (
          <p className="text-sm">
            Check <strong>{email}</strong> and approve the change to <strong>{requested}</strong>.
            Nothing changes until both addresses confirm.
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="flex max-w-md flex-wrap gap-2">
            <Label htmlFor="newEmail" className="sr-only">
              New email
            </Label>
            <Input
              id="newEmail"
              name="newEmail"
              type="email"
              required
              placeholder="new@company.com"
              className="max-w-xs"
            />
            <Button type="submit" variant="outline" disabled={pending}>
              Change email
            </Button>
            <FormError>{error}</FormError>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
