'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';

/**
 * The emailed link opens this page instead of deleting on GET, so a mail scanner following
 * the link can't delete anything, and the user makes the final click.
 */
export function ConfirmDelete({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError('');
    const { error } = await authClient.deleteUser({ token });
    setPending(false);
    if (!error) setDeleted(true);
    else if (error.status === 404) {
      setError('This link has expired, was already used, or belongs to another account.');
    } else setError(error.message ?? 'Could not delete your account');
  }

  if (deleted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your account was deleted</CardTitle>
          <CardDescription>Thanks for trying Evidence AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/signup">Create a new account</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete {email} for good?</CardTitle>
        <CardDescription>
          You will be removed from every workspace and signed out everywhere. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormError>{error}</FormError>
        <div className="flex gap-2">
          <Button variant="destructive" disabled={pending} onClick={() => void confirm()}>
            Delete my account
          </Button>
          <Button asChild variant="outline">
            <Link href="/account/security">Keep my account</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
