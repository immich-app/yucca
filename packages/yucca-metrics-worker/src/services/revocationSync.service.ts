import { isRevocableConnectionType } from '@common/server';
import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { env } from 'src/env';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';

const keyFor = (jti: string) => `yucca:restic:valid:${jti}`;

// Re-asserts the Redis "validity" markers from the DB on an interval. michael
// treats a present marker as valid and an absent one as revoked/unknown, so this
// is what keeps Redis safely ephemeral: a restart that loses every marker is
// healed within one tick, and the markers only ever cover currently-valid
// (minted, not revoked, not expired) tokens of revocable connection types.
@Injectable()
export class RevocationSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private client?: Redis;

  constructor(
    private readonly logger: LoggerRepository,
    private readonly resticTokens: ResticTokenRepository,
  ) {}

  async onApplicationBootstrap() {
    if (env.NODE_ENV === 'development') {
      await this.sync();
    }
  }

  private getClient() {
    this.client ??= new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 2, connectTimeout: 2000, lazyConnect: true });
    return this.client;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sync() {
    if (!env.REDIS_URL) {
      this.logger.warn('REDIS_URL is not set — skipping restic validity reconcile');
      return;
    }

    try {
      const unexpired = await this.resticTokens.getValidUnexpired();
      const valid = unexpired.filter((token) => isRevocableConnectionType(token.connectionType));
      if (valid.length === 0) {
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const pipeline = this.getClient().pipeline();
      for (const token of valid) {
        const exat = Math.ceil(token.expiresAt.getTime() / 1000);
        if (exat > now) {
          pipeline.set(keyFor(token.jti), '1', 'EXAT', exat);
        }
      }
      await pipeline.exec();

      this.logger.info(`Reconciled ${valid.length} valid restic tokens into Redis`);
    } catch (error) {
      this.logger.error(error, 'Failed to reconcile restic validity into Redis');
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
