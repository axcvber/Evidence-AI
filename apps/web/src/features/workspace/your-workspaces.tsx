'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

/** Workspaces the user already belongs to, so onboarding is never a dead end for members. */
export function YourWorkspaces() {
  const router = useRouter();
  const { data: workspaces } = authClient.useListOrganizations();
  if (!workspaces?.length) return null;

  async function open(id: string, slug: string) {
    const { error } = await authClient.organization.setActive({ organizationId: id });
    if (error) {
      toast.error(error.message ?? 'Could not open the workspace');
      return;
    }
    router.push(`/w/${slug}/ask`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Your workspaces</p>
      {workspaces.map((workspace) => (
        <Button
          key={workspace.id}
          variant="outline"
          className="w-full justify-start"
          onClick={() => void open(workspace.id, workspace.slug)}
        >
          {workspace.name}
        </Button>
      ))}
      <p className="pt-2 text-sm text-muted-foreground">Or create a new one:</p>
    </div>
  );
}
