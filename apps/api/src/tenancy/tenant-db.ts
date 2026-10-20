import { AsyncLocalStorage } from 'node:async_hooks';
import { Transaction } from '@evidence/db';
import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError } from '../common/domain-error.js';

/** The tenant-scoped transaction of the current request, set by TenantTransactionInterceptor. */
export const tenantTransactionStorage = new AsyncLocalStorage<Transaction>();

/** Tenant data was requested without an active workspace (or a route needs one). */
export class MissingTenantContextError extends DomainError {
  override readonly name = 'MissingTenantContextError';
  readonly status = HttpStatus.FORBIDDEN;
  readonly code = 'NO_ACTIVE_WORKSPACE';

  constructor() {
    super('Select a workspace to continue');
  }
}

/**
 * The only way request handlers reach tenant data. There is deliberately no accessor for
 * the raw pool: queries always run inside the request's tenant transaction, or not at all.
 */
@Injectable()
export class TenantDb {
  get tx(): Transaction {
    const tx = tenantTransactionStorage.getStore();
    if (!tx) throw new MissingTenantContextError();
    return tx;
  }
}
