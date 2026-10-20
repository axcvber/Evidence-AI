import { hasAtLeastRole, WorkspaceRole } from './roles.js';

/**
 * What each role may do, in one list. The web uses it to show or hide actions; the API puts
 * the same minimum role on the matching endpoints with @Roles, and tests check they agree.
 * The UI is only a convenience: the API is always the one that decides.
 */
export const capabilities = {
  'documents.read': { label: 'View documents', minRole: 'viewer' },
  ask: { label: 'Ask questions', minRole: 'viewer' },
  search: { label: 'Search', minRole: 'viewer' },
  'documents.upload': { label: 'Upload documents', minRole: 'editor' },
  'documents.delete': { label: 'Delete documents', minRole: 'editor' },
  'members.invite': { label: 'Invite members', minRole: 'admin' },
  'members.manage': { label: 'Change roles and remove members', minRole: 'admin' },
  'groups.manage': { label: 'Manage groups', minRole: 'admin' },
  'evals.run': { label: 'Run evaluations', minRole: 'admin' },
  'usage.view': { label: 'View usage and costs', minRole: 'admin' },
  'workspace.rename': { label: 'Rename the workspace', minRole: 'admin' },
  'workspace.delete': { label: 'Delete the workspace', minRole: 'owner' },
} as const satisfies Record<string, { label: string; minRole: WorkspaceRole }>;

export type Capability = keyof typeof capabilities;

export function can(role: WorkspaceRole | null | undefined, capability: Capability): boolean {
  return role ? hasAtLeastRole(role, capabilities[capability].minRole) : false;
}
