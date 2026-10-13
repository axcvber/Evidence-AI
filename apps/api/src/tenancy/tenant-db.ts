import { AsyncLocalStorage } from 'node:async_hooks';
import { Transaction } from '@evidence/db';
import { Injectable } from '@nestjs/common';

/** The tenant-scoped transaction of the current request, set by TenantTransactionInterceptor. */
export const tenantTransactionStorage = new AsyncLocalStorage<Transaction>();

export class MissingTenantContextError extends Error {
  override readonly name = 'MissingTenantContextError';

  constructor() {
    super('Database access requires a tenant context, but none is set for this request');
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
