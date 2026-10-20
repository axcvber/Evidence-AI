import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExceptionFilter } from '../common/api-exception.filter.js';
import { ContractResponseInterceptor } from './contract-response.interceptor.js';

/** API-wide conventions: one error shape for every route, contract-filtered responses. */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ContractResponseInterceptor },
  ],
})
export class ContractsModule {}
