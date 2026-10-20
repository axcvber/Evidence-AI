'use client';

import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import { useWorkspace } from './workspace-context';

export function RenameWorkspaceForm() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), 'name').trim();
    setPending(true);
    setError('');
    const { error } = await authClient.organization.update({
      organizationId: workspace.id,
      data: { name },
    });
    setPending(false);
    if (error) {
      setError(error.message ?? 'Could not rename the workspace');
      return;
    }
    toast.success('Workspace renamed');
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex max-w-md flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={workspace.name} required maxLength={100} />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        Rename
      </Button>
      <FormError>{error}</FormError>
    </form>
  );
}
