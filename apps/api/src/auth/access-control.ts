import { workspacePermissions, workspaceStatements } from '@evidence/shared';
import { createAccessControl } from 'better-auth/plugins/access';

// Built from the shared permission data; the web auth client builds the same in apps/web/src/lib/access-control.ts.
export const accessControl = createAccessControl(workspaceStatements);

export const workspaceRoles = {
  owner: accessControl.newRole(workspacePermissions.owner),
  admin: accessControl.newRole(workspacePermissions.admin),
  editor: accessControl.newRole(workspacePermissions.editor),
  viewer: accessControl.newRole(workspacePermissions.viewer),
};
