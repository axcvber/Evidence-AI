'use client';

import type { WorkspaceRole } from '@evidence/shared';
import { hasAtLeastRole, workspaceRoleNames } from '@evidence/shared';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/confirm-button';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Can, useCan, useWorkspace } from '@/features/workspace/workspace-context';
import { authClient } from '@/lib/auth-client';

/** Roles the current user may hand out: owners can make owners, admins everything below. */
function assignableRoles(myRole: WorkspaceRole): WorkspaceRole[] {
  return workspaceRoleNames.filter((role) => myRole === 'owner' || role !== 'owner');
}

/**
 * Whether the current user may change or remove this member. Mirrors the API: admins manage
 * admins, editors and viewers; only owners manage owners. The API enforces it either way.
 */
function canManage(myRole: WorkspaceRole, targetRole: string): boolean {
  if (!hasAtLeastRole(myRole, 'admin')) return false;
  return myRole === 'owner' || targetRole !== 'owner';
}

function RoleSelect({
  value,
  roles,
  disabled,
  onChange,
}: {
  value: string;
  roles: WorkspaceRole[];
  disabled?: boolean;
  onChange: (role: WorkspaceRole) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as WorkspaceRole)}>
      <SelectTrigger size="sm" className="w-28 capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role} className="capitalize">
            {role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const { workspace } = useWorkspace();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [pending, setPending] = useState(false);

  async function invite() {
    setPending(true);
    const { error } = await authClient.organization.inviteMember({ email, role });
    setPending(false);
    if (error) {
      toast.error(error.message ?? 'Could not send the invitation');
      return;
    }
    toast.success(`Invitation sent to ${email}`);
    setEmail('');
    onInvited();
  }

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void invite();
      }}
    >
      <Input
        type="email"
        required
        placeholder="teammate@company.com"
        className="max-w-xs"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <RoleSelect value={role} roles={assignableRoles(workspace.role)} onChange={setRole} />
      <Button type="submit" disabled={pending}>
        <UserPlus /> Invite
      </Button>
    </form>
  );
}

export function MembersPage() {
  const router = useRouter();
  const { user, workspace } = useWorkspace();
  const canInvite = useCan('members.invite');
  const { data: full, isPending, refetch } = authClient.useActiveOrganization();
  const [busy, setBusy] = useState(false);
  const pendingInvitations = (full?.invitations ?? []).filter(
    (i) => i.status === 'pending' && new Date(i.expiresAt).getTime() > Date.now(),
  );

  /** Runs a Better Auth call, reports the outcome, and refreshes the list (and my role). */
  async function run(
    action: () => Promise<{ error: { message?: string } | null }>,
    done: string,
    affectsMe = false,
  ): Promise<boolean> {
    setBusy(true);
    const { error } = await action();
    setBusy(false);
    if (error) toast.error(error.message ?? 'That did not work');
    else toast.success(done);
    await refetch();
    if (affectsMe && !error) router.refresh();
    return !error;
  }

  return (
    <>
      <PageHeader title="Members" description="People in this workspace and their roles." />
      <Can capability="members.invite">
        <InviteForm onInvited={() => void refetch()} />
      </Can>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(full?.members ?? []).map((member) => {
              const isMe = member.userId === user.id;
              const manageable = canManage(workspace.role, member.role);
              return (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.user.name}
                    {isMe && <span className="text-muted-foreground"> (you)</span>}
                  </TableCell>
                  <TableCell>{member.user.email}</TableCell>
                  <TableCell>
                    {manageable ? (
                      <RoleSelect
                        value={member.role}
                        roles={assignableRoles(workspace.role)}
                        disabled={busy}
                        onChange={(role) =>
                          void run(
                            () =>
                              authClient.organization.updateMemberRole({
                                memberId: member.id,
                                role,
                              }),
                            `${member.user.name} is now ${role === 'admin' ? 'an' : 'a'} ${role}`,
                            isMe,
                          )
                        }
                      />
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        {member.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {manageable && !isMe && (
                      <ConfirmButton
                        title={`Remove ${member.user.name}?`}
                        description="They lose access to this workspace and its documents right away, and leave all of its groups."
                        confirmLabel="Remove"
                        disabled={busy}
                        onConfirm={() =>
                          run(
                            () =>
                              authClient.organization.removeMember({ memberIdOrEmail: member.id }),
                            `${member.user.name} was removed`,
                          )
                        }
                      >
                        Remove
                      </ConfirmButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {workspace.role === 'owner' && (
        <p className="text-sm text-muted-foreground">
          To hand over the workspace, make someone else an owner, then change your own role. There
          must always be at least one owner.
        </p>
      )}

      {canInvite && pendingInvitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pending invitations</h2>
          <Table>
            <TableBody>
              {pendingInvitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {invitation.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !canManage(workspace.role, invitation.role)}
                      onClick={() =>
                        void run(
                          // A new invitation replaces the old one, whose link stops working.
                          () =>
                            authClient.organization.inviteMember({
                              email: invitation.email,
                              role: invitation.role,
                            }),
                          `Sent a new invitation to ${invitation.email}`,
                        )
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || !canManage(workspace.role, invitation.role)}
                      onClick={() =>
                        void run(
                          () =>
                            authClient.organization.cancelInvitation({
                              invitationId: invitation.id,
                            }),
                          `Invitation to ${invitation.email} canceled`,
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}
