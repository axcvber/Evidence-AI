'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

const myInvitationsKey = ['account', 'invitations'] as const;

/** Pending, unexpired invitations addressed to the signed-in user's email. */
export function useMyInvitations() {
  return useQuery({
    queryKey: myInvitationsKey,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listUserInvitations();
      if (error) throw new Error(error.message ?? 'Could not load invitations');
      const now = Date.now();
      return data.filter((i) => i.status === 'pending' && new Date(i.expiresAt).getTime() > now);
    },
  });
}

export function MyInvitations({ emptyText }: { emptyText?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: invitations, isPending } = useMyInvitations();
  const [busy, setBusy] = useState<string | null>(null);

  if (isPending) return null;
  if (!invitations?.length) {
    return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null;
  }

  async function accept(invitationId: string) {
    setBusy(invitationId);
    const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setBusy(null);
      toast.error(error.message ?? 'Could not accept the invitation');
      return;
    }
    await authClient.organization.setActive({ organizationId: data.member.organizationId });
    router.push('/');
    router.refresh();
  }

  async function decline(invitationId: string) {
    setBusy(invitationId);
    const { error } = await authClient.organization.rejectInvitation({ invitationId });
    setBusy(null);
    if (error) toast.error(error.message ?? 'Could not decline the invitation');
    else toast.success('Invitation declined');
    await queryClient.invalidateQueries({ queryKey: myInvitationsKey });
  }

  return (
    <ul className="space-y-2">
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
        >
          <div className="text-sm">
            <div className="font-medium">{invitation.organizationName}</div>
            <Badge variant="secondary" className="capitalize">
              {invitation.role}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy !== null} onClick={() => void accept(invitation.id)}>
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void decline(invitation.id)}
            >
              Decline
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
