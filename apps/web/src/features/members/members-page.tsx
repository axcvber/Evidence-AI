'use client';

import type { WorkspaceRole } from '@evidence/shared';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Can } from '@/features/workspace/workspace-context';
import { authClient } from '@/lib/auth-client';

type InvitableRole = Exclude<WorkspaceRole, 'owner'>;

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('viewer');
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
      <Select value={role} onValueChange={(value) => setRole(value as InvitableRole)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viewer">Viewer</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" disabled={pending}>
        <UserPlus /> Invite
      </Button>
    </form>
  );
}

/** Read-only list for now; changing roles and removing members comes with step 1.10. */
export function MembersPage() {
  const { data: workspace, isPending, refetch } = authClient.useActiveOrganization();
  const pendingInvitations = (workspace?.invitations ?? []).filter((i) => i.status === 'pending');

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {(workspace?.members ?? []).map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.user.name}</TableCell>
                <TableCell>{member.user.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {member.role}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {pendingInvitations.map((invitation) => (
              <TableRow key={invitation.id} className="text-muted-foreground">
                <TableCell>Invited</TableCell>
                <TableCell>{invitation.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {invitation.role} · pending
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
