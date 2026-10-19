import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { accessControl, workspaceRoles } from './access-control';

// Same-origin: requests go to /api/auth on this app and are proxied to the API.
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac: accessControl, roles: workspaceRoles })],
});
