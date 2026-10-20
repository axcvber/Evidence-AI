'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteWorkspaceCard } from './delete-workspace-card';
import { LeaveWorkspaceButton } from './leave-workspace-button';
import { RenameWorkspaceForm } from './rename-workspace-form';
import { Can, useWorkspace } from './workspace-context';

export function WorkspaceSettingsPage() {
  const { workspace } = useWorkspace();
  return (
    <>
      <PageHeader title="Workspace" description="Settings for this workspace." />
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            The URL name <span className="font-mono">{workspace.slug}</span> stays the same so links
            keep working. Your role: <span className="capitalize">{workspace.role}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Can capability="workspace.rename" fallback={<p className="text-sm">{workspace.name}</p>}>
            <RenameWorkspaceForm />
          </Can>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Leave workspace</CardTitle>
          <CardDescription>Owners can leave only while another owner remains.</CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveWorkspaceButton />
        </CardContent>
      </Card>
      <Can capability="workspace.delete">
        <DeleteWorkspaceCard />
      </Can>
    </>
  );
}
