'use client';

import type { Capability } from '@evidence/shared';
import { can } from '@evidence/shared';
import {
  FileText,
  FlaskConical,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AccountMenu } from '@/features/account/account-menu';
import { useWorkspace } from './workspace-context';
import { WorkspaceSwitcher } from './workspace-switcher';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden from roles without this capability (the API refuses them anyway). */
  capability?: Capability;
}

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Ask', href: 'ask', icon: MessageSquare, capability: 'ask' },
      { label: 'Search', href: 'search', icon: Search, capability: 'search' },
      { label: 'Documents', href: 'documents', icon: FileText, capability: 'documents.read' },
      { label: 'Evals', href: 'evals', icon: FlaskConical, capability: 'evals.run' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Members', href: 'settings/members', icon: Users },
      { label: 'Access', href: 'settings/access', icon: ShieldCheck },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  const base = `/w/${workspace.slug}`;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items
                  .filter((item) => !item.capability || can(workspace.role, item.capability))
                  .map((item) => {
                    const href = `${base}/${item.href}`;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname.startsWith(href)}
                          tooltip={item.label}
                        >
                          <Link href={href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
