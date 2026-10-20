import type { Database } from '@evidence/db';
import { memberships, withTenantContext } from '@evidence/db';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import type { Auth } from './auth.js';
import { AUTH } from './auth.tokens.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Global guard: every route needs a valid session unless marked @Public(). When the session
 * has an active workspace, the membership is re-checked in the database on every request
 * (so removed members lose access immediately); only a confirmed membership attaches the
 * tenant context for TenantTransactionInterceptor and the role for RolesGuard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (context.getType() !== 'http') return false;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    request.auth = session;

    const tenantId = session.session.activeOrganizationId;
    if (tenantId) {
      const userId = session.user.id;
      const role = await this.findRole(tenantId, userId);
      // A stale or forged active workspace (membership removed, session tampered with) grants
      // nothing: no tenant context, no role. Tenant routes then fail closed with
      // NO_ACTIVE_WORKSPACE, while /api/me still answers so the user can pick another workspace.
      if (role) {
        request.tenantContext = { tenantId, userId };
        request.membershipRole = role;
      }
    }
    return true;
  }

  private async findRole(tenantId: string, userId: string) {
    const rows = await withTenantContext(this.db, { tenantId, userId }, (tx) =>
      tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId))),
    );
    return rows[0]?.role;
  }
}
