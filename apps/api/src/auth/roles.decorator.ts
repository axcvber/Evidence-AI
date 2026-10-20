import { WorkspaceRole } from '@evidence/shared';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';

export const MIN_ROLE = 'auth:minRole';

/**
 * The minimum workspace role a route needs: `@Roles('editor')` admits editors, admins and
 * owners (see `hasAtLeastRole`). On a controller it applies to every route; a method-level
 * `@Roles` overrides it. Routes without it are open to any member of the active workspace.
 */
export const Roles = (minimum: WorkspaceRole) =>
  applyDecorators(
    SetMetadata(MIN_ROLE, minimum),
    ApiForbiddenResponse({
      description: `Requires the ${minimum} role or higher in the active workspace`,
    }),
  );
