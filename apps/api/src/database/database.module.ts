import { createDb, Database } from '@evidence/db';
import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';

export const DATABASE = Symbol('DATABASE');
const DATABASE_POOL = Symbol('DATABASE_POOL');

type Pool = ReturnType<typeof createDb>['pool'];

export interface DatabaseModuleOptions {
  /** Must connect as the application role (evidence_app), never the owner. */
  url: string;
}

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    const { db, pool } = createDb(options.url);
    return {
      module: DatabaseModule,
      providers: [
        { provide: DATABASE, useValue: db satisfies Database },
        { provide: DATABASE_POOL, useValue: pool },
        DatabaseShutdown,
      ],
      exports: [DATABASE],
    };
  }
}
