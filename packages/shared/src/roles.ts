// Workspace roles and what each may do through Better Auth's organization endpoints, as plain
// data so the API (auth server) and web (auth client) build identical access control from it.
// Owner and admin manage the workspace and its members (including invites); editor and viewer
// cannot. What editors and viewers may do with documents is enforced in the API by the
// @Roles() guard (step 1.6). Role names must match the `membership_role` enum in packages/db.

export const workspaceRoleNames = ['owner', 'admin', 'editor', 'viewer'] as const;
export type WorkspaceRole = (typeof workspaceRoleNames)[number];

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
