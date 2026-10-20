'use client';

import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/features/auth/auth-card';
import { authClient } from '@/lib/auth-client';
import { useWorkspace } from './workspace-context';

/** Moves the user into another of their workspaces, or to onboarding when none is left. */
async function leaveDeletedWorkspace(router: ReturnType<typeof useRouter>) {
  const { data: remaining } = await authClient.organization.list();
  const next = remaining?.[0];
  if (next) {
    await authClient.organization.setActive({ organizationId: next.id });
    router.push(`/w/${next.slug}/ask`);
  } else {
    router.push('/onboarding');
  }
  router.refresh();
}

export function DeleteWorkspaceCard() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [confirmSlug, setConfirmSlug] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    setError('');
    // `confirmSlug` isn't in Better Auth's typed client, so call the endpoint directly. The API
    // checks the typed slug too, and that the caller is an owner.
    const { error } = await authClient.$fetch('/organization/delete', {
      method: 'POST',
      body: { organizationId: workspace.id, confirmSlug },
    });
    if (error) {
      setPending(false);
      setError(error.message ?? 'Could not delete the workspace');
      return;
    }
    await leaveDeletedWorkspace(router);
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete workspace</CardTitle>
        <CardDescription>
          Permanently deletes {workspace.name} and everything in it: members, pending invitations,
          groups and the audit log. People keep their accounts. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog
          onOpenChange={() => {
            setConfirmSlug('');
            setError('');
          }}
        >
          <DialogTrigger asChild>
            <Button variant="destructive">Delete this workspace</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {workspace.name}?</DialogTitle>
              <DialogDescription>
                Everyone in it loses access immediately. Type <strong>{workspace.slug}</strong> to
                confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirmSlug" className="sr-only">
                Workspace URL name
              </Label>
              <Input
                id="confirmSlug"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                autoComplete="off"
                placeholder={workspace.slug}
              />
            </div>
            <FormError>{error}</FormError>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={pending || confirmSlug !== workspace.slug}
                onClick={() => void remove()}
              >
                Delete permanently
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
