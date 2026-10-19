import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailSender } from './email/email-sender.js';
import { EmailModule } from './email/email.module.js';
import { ApiEnv } from './env.js';
import { HealthModule } from './health/health.module.js';
import { MeModule } from './me/me.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

export interface AppModuleOptions {
  env: ApiEnv;
  /** Replaces the Resend/console sender, e.g. to capture emails in tests. */
  emailSender?: EmailSender;
}

@Module({})
export class AppModule {
  static register({ env, emailSender }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.forRoot({ url: env.DATABASE_URL }),
        EmailModule.forRoot({
          resendApiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM,
          sender: emailSender,
        }),
        AuthModule.forRoot({
          databaseUrl: env.AUTH_DATABASE_URL,
          secret: env.BETTER_AUTH_SECRET,
          baseUrl: env.BETTER_AUTH_URL,
          secureCookies: env.NODE_ENV === 'production',
          rateLimit: env.NODE_ENV !== 'test',
        }),
        TenancyModule,
        HealthModule,
        MeModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
    };
  }
}
