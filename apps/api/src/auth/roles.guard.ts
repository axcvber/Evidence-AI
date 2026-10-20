import { hasAtLeastRole, WorkspaceRole } from '@evidence/shared';
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../common/domain-error.js';
import { MissingTenantContextError } from '../tenancy/tenant-db.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { MIN_ROLE } from './roles.decorator.js';

export class InsufficientRoleError extends DomainError {
  override readonly name = 'InsufficientRoleError';
  readonly status = HttpStatus.FORBIDDEN;
  readonly code = 'INSUFFICIENT_ROLE';

  constructor(minimum: WorkspaceRole) {
    super(`This action requires the ${minimum} role or higher`);
  }
}

/**
 * Enforces @Roles(). Runs after AuthGuard, which has already re-read the caller's role for the
 * active workspace from the database on this request, so role changes apply immediately.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minimum = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(MIN_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minimum) return true;

    const { membershipRole } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!membershipRole) throw new MissingTenantContextError();
    if (!hasAtLeastRole(membershipRole, minimum)) throw new InsufficientRoleError(minimum);
    return true;
  }
}
