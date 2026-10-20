'use client';

import { MIN_PASSWORD_LENGTH } from '@evidence/shared';
import { useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { useLinkedAccounts } from './queries';

function ChangePasswordForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = formText(form, 'newPassword');
    if (newPassword !== formText(form, 'confirm')) {
      setError("The new passwords don't match.");
      return;
    }
    setPending(true);
    setError('');
    const { error } = await authClient.changePassword({
      currentPassword: formText(form, 'currentPassword'),
      newPassword,
      revokeOtherSessions: form.get('revokeOthers') === 'on',
    });
    setPending(false);
    if (error) {
      setError(
        error.code === 'INVALID_PASSWORD'
          ? 'Your current password is incorrect.'
          : error.status === 429
            ? 'Too many attempts. Wait a minute and try again.'
            : (error.message ?? 'Could not change the password'),
      );
      return;
    }
    formElement.reset();
    toast.success('Password changed');
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Repeat the new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoComplete="new-password"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="revokeOthers" defaultChecked className="size-4" />
        Sign out my other devices
      </label>
      <FormError>{error}</FormError>
      <Button type="submit" disabled={pending}>
        Change password
      </Button>
    </form>
  );
}

/** Social-only accounts set a first password through the emailed reset link. */
function SetPasswordByEmail({ email }: { email: string }) {
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setPending(false);
    if (error) toast.error(error.message ?? 'Could not send the link');
    else toast.success(`We sent a link to ${email}`);
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        You sign in with a connected account. To also sign in with a password, we&apos;ll email you
        a link to set one. Setting it signs you out everywhere.
      </p>
      <Button variant="outline" disabled={pending} onClick={() => void send()}>
        Email me a link to set a password
      </Button>
    </div>
  );
}

export function PasswordCard({ email }: { email: string }) {
  const { data: accounts, isPending } = useLinkedAccounts();
  const hasPassword = accounts?.some((account) => account.providerId === 'credential');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>We email you whenever your password changes.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-32 w-full max-w-sm" />
        ) : hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <SetPasswordByEmail email={email} />
        )}
      </CardContent>
    </Card>
  );
}
