import { workspacePermissions, workspaceStatements } from '@evidence/shared';
import { createAccessControl } from 'better-auth/plugins/access';

// Built from the shared permission data; the API builds the same for the auth server in apps/api/src/auth/access-control.ts.
export const accessControl = createAccessControl(workspaceStatements);

export const workspaceRoles = {
  owner: accessControl.newRole(workspacePermissions.owner),
  admin: accessControl.newRole(workspacePermissions.admin),
  editor: accessControl.newRole(workspacePermissions.editor),
  viewer: accessControl.newRole(workspacePermissions.viewer),
};
