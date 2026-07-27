import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { env } from 'src/env';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';

const keyFor = (jti: string) => `yucca:restic:revoked:${jti}`;

// Re-seeds the Redis revocation denylist from the DB on an interval. This is
// what makes Redis safely ephemeral: a restart that loses every key is healed
// within one tick, so the deployment needs no persistence.
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
      this.logger.warn('REDIS_URL is not set — skipping restic revocation reconcile');
      return;
    }

    try {
      const revoked = await this.resticTokens.getRevokedUnexpired();
      if (revoked.length === 0) {
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const pipeline = this.getClient().pipeline();
      for (const token of revoked) {
        const exat = Math.ceil(token.expiresAt.getTime() / 1000);
        if (exat > now) {
          pipeline.set(keyFor(token.jti), '1', 'EXAT', exat);
        }
      }
      await pipeline.exec();

      this.logger.info(`Reconciled ${revoked.length} revoked restic tokens into Redis`);
    } catch (error) {
      this.logger.error(error, 'Failed to reconcile restic revocations into Redis');
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
