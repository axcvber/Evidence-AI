'use client';

import { userNameSchema } from '@evidence/shared';
import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = userNameSchema.safeParse(formText(new FormData(event.currentTarget), 'name'));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter your name');
      return;
    }
    setPending(true);
    setError('');
    const { error } = await authClient.updateUser({ name: parsed.data });
    setPending(false);
    if (error) {
      setError(error.message ?? 'Could not save');
      return;
    }
    toast.success('Profile saved');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you appear to people in your workspaces.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={name} required maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
            <p className="text-xs text-muted-foreground">Change it under Security.</p>
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
