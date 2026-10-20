import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS = Symbol('REDIS');

export interface RedisModuleOptions {
  url: string;
}

/**
 * Commands fail fast instead of queueing while Redis is unreachable: sessions live in Redis,
 * so an outage must turn into errors (fail closed), never into requests that hang or skip
 * the session check.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    maxRetriesPerRequest: 1,
    lazyConnect: false,
  });
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => {
      this.redis.disconnect();
    });
  }
}

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        { provide: REDIS, useFactory: () => createRedisClient(options.url) },
        RedisShutdown,
      ],
      exports: [REDIS],
    };
  }
}
