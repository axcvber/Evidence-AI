import { DynamicModule, Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

export interface AppModuleOptions {
  databaseUrl: string;
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.forRoot({ url: options.databaseUrl }), TenancyModule, HealthModule],
    };
  }
}
