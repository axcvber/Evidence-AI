'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';

export function DeleteAccountCard({ email }: { email: string }) {
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function request() {
    setPending(true);
    setError('');
    const { error } = await authClient.deleteUser({});
    setPending(false);
    if (error) setError(error.message ?? 'Could not start deleting your account');
    else setSent(true);
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently deletes your account and removes you from every workspace. If you are the only
          owner of a workspace, make someone else an owner or delete the workspace first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sent ? (
          <p className="text-sm">
            We sent a confirmation link to <strong>{email}</strong>. Open it in this browser within
            an hour to delete your account.
          </p>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete my account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  We&apos;ll email a confirmation link to {email}. Your account is deleted only when
                  you open it. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <FormError>{error}</FormError>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="destructive" disabled={pending} onClick={() => void request()}>
                  Email me the link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
