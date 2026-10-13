import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantDb } from './tenant-db.js';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor.js';

@Global()
@Module({
  providers: [TenantDb, { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor }],
  exports: [TenantDb],
})
export class TenancyModule {}
