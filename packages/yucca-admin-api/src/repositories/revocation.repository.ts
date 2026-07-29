import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from 'src/env';

const keyFor = (jti: string) => `yucca:michael:verdict:${jti}`;

// Pushes revocations into michael's shared verdict cache (generic platform
// valkey): deleting the cached verdict forces michael's next post-fresh check
// back to introspection, which reads the DB truth. Best-effort by design — a
// missed DEL self-heals when the verdict entry's short TTL lapses, so a Redis
// hiccup delays propagation by minutes, never breaks correctness.
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

  // Call after the DB revoke. Failure is logged, not thrown: the DB is already
  // authoritative and the stale cache entry expires within its TTL.
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
