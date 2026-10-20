import type { EndpointDefinition } from '@evidence/shared';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { ENDPOINT } from './endpoint.decorator.js';

/**
 * Passes every @Endpoint response through its contract's schema. Zod objects drop keys the
 * contract doesn't declare, so an extra field from the database never leaks to the client;
 * a response that breaks its contract is a server bug and becomes a 500.
 */
@Injectable()
export class ContractResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const contract = this.reflector.get<EndpointDefinition | undefined>(
      ENDPOINT,
      context.getHandler(),
    );
    if (!contract) return next.handle();
    return next.handle().pipe(map((body: unknown) => contract.response.parse(body)));
  }
}
