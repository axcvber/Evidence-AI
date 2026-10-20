'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import { useWorkspace } from './workspace-context';

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { data: workspaces } = authClient.useListOrganizations();

  async function switchTo(id: string, slug: string) {
    const { error } = await authClient.organization.setActive({ organizationId: id });
    if (error) {
      toast.error(error.message ?? 'Could not switch workspace');
      return;
    }
    router.push(`/w/${slug}/ask`);
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                {workspace.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{workspace.name}</span>
                <span className="truncate text-xs capitalize text-muted-foreground">
                  {workspace.role}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {(workspaces ?? []).map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => void switchTo(item.id, item.slug)}>
                <span className="truncate">{item.name}</span>
                {item.id === workspace.id && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/onboarding">
                <Plus /> Create workspace
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
