import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ActivateWorkspace } from '@/features/workspace/activate-workspace';
import { AppSidebar } from '@/features/workspace/app-sidebar';
import { WorkspaceProvider } from '@/features/workspace/workspace-context';
import { getCurrentUser } from '@/lib/session';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/w/${slug}/ask`)}`);
  if (me.activeWorkspace?.slug !== slug) return <ActivateWorkspace slug={slug} />;

  return (
    <WorkspaceProvider value={{ user: me.user, workspace: me.activeWorkspace }}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground">{me.activeWorkspace.name}</span>
          </header>
          <div className="mx-auto w-full max-w-5xl space-y-6 p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}
