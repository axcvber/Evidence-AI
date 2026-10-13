import type { Database } from '@evidence/db';
import { withTenantContext } from '@evidence/db';
import { TenantContext } from '@evidence/shared';
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import { DATABASE } from '../database/database.module.js';
import { tenantTransactionStorage } from './tenant-db.js';

/** Set by the auth guard (step 1.5) once it has resolved the user's membership. */
export interface TenantRequest {
  tenantContext?: TenantContext;
}

/**
 * Runs each request that carries a tenant context inside one transaction with
 * `app.tenant_id` set, so RLS scopes every query the handler makes. It is an interceptor
 * rather than middleware because interceptors run after guards, which resolve the tenant.
 * Requests without a context run without a transaction, and TenantDb refuses to query.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const tenantContext = context.switchToHttp().getRequest<TenantRequest>().tenantContext;
    if (!tenantContext) return next.handle();

    return from(
      withTenantContext(this.db, tenantContext, (tx) =>
        tenantTransactionStorage.run(tx, () =>
          lastValueFrom(next.handle(), { defaultValue: undefined }),
        ),
      ),
    );
  }
}
