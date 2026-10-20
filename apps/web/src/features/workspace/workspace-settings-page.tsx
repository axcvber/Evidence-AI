'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteWorkspaceCard } from './delete-workspace-card';
import { Can, useWorkspace } from './workspace-context';

export function WorkspaceSettingsPage() {
  const { workspace } = useWorkspace();
  return (
    <>
      <PageHeader title="Workspace" description="Settings for this workspace." />
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
          <span className="text-muted-foreground">Name</span>
          <span>{workspace.name}</span>
          <span className="text-muted-foreground">URL name</span>
          <span className="font-mono">{workspace.slug}</span>
          <span className="text-muted-foreground">Your role</span>
          <span className="capitalize">{workspace.role}</span>
        </CardContent>
      </Card>
      <Can
        capability="workspace.delete"
        fallback={
          <p className="text-sm text-muted-foreground">Only owners can delete this workspace.</p>
        }
      >
        <DeleteWorkspaceCard />
      </Can>
    </>
  );
}
