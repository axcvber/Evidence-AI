import { createDb } from '@evidence/db';
import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Redis } from 'ioredis';
import { EMAIL_SENDER, EmailSender } from '../email/email-sender.js';
import { REDIS } from '../redis/redis.module.js';
import { AuthOptions, createAuth } from './auth.js';
import { AuthGuard } from './auth.guard.js';
import { AUTH } from './auth.tokens.js';
import { RolesGuard } from './roles.guard.js';

export { AUTH };

const AUTH_DATABASE_POOL = Symbol('AUTH_DATABASE_POOL');

type Pool = ReturnType<typeof createDb>['pool'];

export interface AuthModuleOptions extends Omit<AuthOptions, 'db' | 'emailSender' | 'redis'> {
  /** Must connect as evidence_auth, never the app or owner role. */
  databaseUrl: string;
}

@Injectable()
class AuthDatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(AUTH_DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    const { databaseUrl, ...authOptions } = options;
    const { db, pool } = createDb(databaseUrl, { max: 5 });

    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_DATABASE_POOL, useValue: pool },
        AuthDatabaseShutdown,
        {
          provide: AUTH,
          inject: [EMAIL_SENDER, REDIS],
          useFactory: (emailSender: EmailSender, redis: Redis) =>
            createAuth({ ...authOptions, db, emailSender, redis }),
        },
        // Global guards run in registration order: authenticate first, then check the role.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
      exports: [AUTH],
    };
  }
}
