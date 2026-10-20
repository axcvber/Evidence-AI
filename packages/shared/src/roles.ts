// Workspace roles and what each may do through Better Auth's organization endpoints, as plain
// data so the API (auth server) and web (auth client) build identical access control from it.
// Owner and admin manage the workspace and its members (including invites); editor and viewer
// cannot. Everything else is enforced by the API's @Roles() guard using `hasAtLeastRole`.
// Role names must match the `membership_role` enum in packages/db.

export const workspaceRoleNames = ['owner', 'admin', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof workspaceRoleNames)[number];

const roleRank: Record<WorkspaceRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

/** Roles are ranked owner > admin > editor > viewer; a higher role can do what a lower one can. */
export function hasAtLeastRole(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

/** Resources and actions Better Auth's organization plugin checks. */
export const workspaceStatements = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
} as const;

const noWorkspaceManagement = {
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ['read'],
} as const;

export const workspacePermissions = {
  owner: workspaceStatements,
  admin: {
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
  },
  editor: noWorkspaceManagement,
  viewer: noWorkspaceManagement,
} as const satisfies Record<WorkspaceRole, unknown>;
