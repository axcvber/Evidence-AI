'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/confirm-button';
import { authClient } from '@/lib/auth-client';
import { useWorkspace } from './workspace-context';

export function LeaveWorkspaceButton() {
  const router = useRouter();
  const { workspace } = useWorkspace();

  async function leave(): Promise<boolean> {
    const { error } = await authClient.organization.leave({ organizationId: workspace.id });
    if (error) {
      // The API refuses when you are the only owner.
      toast.error(error.message ?? 'Could not leave the workspace');
      return false;
    }
    router.push('/');
    router.refresh();
    return true;
  }

  return (
    <ConfirmButton
      title={`Leave ${workspace.name}?`}
      description="You lose access to its documents. You can only come back if someone invites you again."
      confirmLabel="Leave"
      size="default"
      onConfirm={leave}
    >
      Leave workspace
    </ConfirmButton>
  );
}
