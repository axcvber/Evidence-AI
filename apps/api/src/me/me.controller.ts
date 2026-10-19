import { tenants } from '@evidence/db';
import type { MeResponse } from '@evidence/shared';
import { meResponseSchema } from '@evidence/shared';
import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { TenantDb } from '../tenancy/tenant-db.js';

@ApiTags('me')
@ApiCookieAuth()
@Controller('me')
export class MeController {
  constructor(private readonly tenantDb: TenantDb) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user and their active workspace' })
  @ApiOkResponse({ standardSchema: meResponseSchema })
  async me(@Req() request: AuthenticatedRequest): Promise<MeResponse> {
    // AuthGuard sets this on every non-public route; the check keeps that assumption explicit.
    if (!request.auth) throw new UnauthorizedException();
    const { user } = request.auth;
    const base = {
      user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified },
    };
    if (!request.tenantContext || !request.membershipRole)
      return { ...base, activeWorkspace: null };

    // No WHERE needed: RLS limits `tenants` to the active workspace.
    const [tenant] = await this.tenantDb.tx
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants);
    return {
      ...base,
      activeWorkspace: tenant ? { ...tenant, role: request.membershipRole } : null,
    };
  }
}
