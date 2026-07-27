import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from 'src/env';

const keyFor = (jti: string) => `yucca:restic:revoked:${jti}`;

// Mirrors restic-token revocations into Redis, where michael checks them per
// request. The DB (resticTokens.revokedAt) stays the source of truth; the
// metrics-worker reconcile re-seeds Redis, so Redis itself is ephemeral.
@Injectable()
export class RevocationRepository implements OnModuleDestroy {
  private client?: Redis;

  constructor(private readonly logger: LoggerRepository) {
    if (!env.REDIS_URL) {
      this.logger.warn('REDIS_URL is not set — restic token revocations will not propagate to michael');
    }
  }

  private getClient() {
    this.client ??= new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 2, connectTimeout: 2000, lazyConnect: true });
    return this.client;
  }

  // Call after the DB revokedAt update. The key expires with the token, so
  // the denylist only ever holds revoked-and-unexpired jtis.
  async markRevoked(jti: string, expiresAt: Date) {
    if (!env.REDIS_URL) {
      return;
    }
    const exat = Math.ceil(expiresAt.getTime() / 1000);
    if (exat <= Math.floor(Date.now() / 1000)) {
      return;
    }
    await this.getClient().set(keyFor(jti), '1', 'EXAT', exat);
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
