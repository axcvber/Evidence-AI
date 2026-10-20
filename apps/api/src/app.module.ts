import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailSender } from './email/email-sender.js';
import { EmailModule } from './email/email.module.js';
import { DevMocksModule } from './dev-mocks/dev-mocks.module.js';
import {
  ApiEnv,
  apiDocsEnabled,
  authRateLimitEnabled,
  devMocksEnabled,
  socialProviderCredentials,
} from './env.js';
import { HealthModule } from './health/health.module.js';
import { MeModule } from './me/me.module.js';
import { RedisModule } from './redis/redis.module.js';
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
        RedisModule.forRoot({ url: env.REDIS_URL }),
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
          redisKeyPrefix: env.AUTH_REDIS_KEY_PREFIX,
          rateLimit: authRateLimitEnabled(env),
          openApiReference: apiDocsEnabled(env),
          clientIp: {
            header: env.CLIENT_IP_HEADER ?? 'x-forwarded-for',
            trustedProxies: env.TRUSTED_PROXIES,
          },
          socialProviders: socialProviderCredentials(env),
        }),
        ContractsModule,
        TenancyModule,
        HealthModule,
        MeModule,
        ...(devMocksEnabled(env) ? [DevMocksModule] : []),
      ],
    };
  }
}
