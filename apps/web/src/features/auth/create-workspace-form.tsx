'use client';

import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { FormError } from './auth-card';

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  // A short random suffix keeps slugs unique without asking the user to pick one.
  return `${slug || 'workspace'}-${crypto.randomUUID().slice(0, 6)}`;
}

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), 'name');
    setPending(true);
    setError('');
    const { data, error } = await authClient.organization.create({ name, slug: slugify(name) });
    if (error) {
      setPending(false);
      setError(error.message ?? 'Could not create the workspace');
      return;
    }
    router.push(`/w/${data.slug}/ask`);
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input id="name" name="name" required maxLength={100} placeholder="Acme Research" />
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" className="w-full" disabled={pending}>
        Create workspace
      </Button>
    </form>
  );
}
