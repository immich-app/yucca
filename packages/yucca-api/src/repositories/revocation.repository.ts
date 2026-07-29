import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from 'src/env';

const keyFor = (jti: string) => `yucca:michael:verdict:${jti}`;

@Injectable()
export class RevocationRepository implements OnModuleDestroy {
  private client?: Redis;

  constructor(private readonly logger: LoggerRepository) {
    if (!env.REDIS_URL) {
      this.logger.warn('REDIS_URL is not set — revocations propagate to michael only via verdict-cache TTL expiry');
    }
  }

  private getClient() {
    this.client ??= new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 2, connectTimeout: 2000, lazyConnect: true });
    return this.client;
  }

  async invalidateVerdict(jti: string) {
    if (!env.REDIS_URL) {
      return;
    }
    try {
      await this.getClient().del(keyFor(jti));
    } catch (error) {
      this.logger.warn(`Failed to invalidate michael verdict cache for ${jti} (self-heals via TTL): ${String(error)}`);
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
