import { isRevocableConnectionType } from '@common/server';
import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { env } from 'src/env';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';

const keyFor = (jti: string) => `yucca:restic:valid:${jti}`;

// Reconciles the Redis "validity" markers with the DB, in BOTH directions.
// michael treats a present marker as valid and an absent one as revoked/unknown:
// - assert markers for currently-valid (minted, unrevoked, unexpired) tokens of
//   revocable connection types — heals a non-persistent Redis losing everything;
// - delete markers for revoked-but-unexpired tokens — heals a revoke whose
//   inline DEL failed (Redis blip between the DB write and the marker delete),
//   which would otherwise keep honoring the token until its natural expiry.
// Runs eagerly at bootstrap (a restarted Redis is reachable-but-empty, so grace
// does not cover it — the sooner markers are re-seeded, the shorter the deny
// window for valid restic tokens) and every 5 minutes thereafter.
@Injectable()
export class RevocationSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private client?: Redis;

  constructor(
    private readonly logger: LoggerRepository,
    private readonly resticTokens: ResticTokenRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.sync();
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
      const revoked = await this.resticTokens.getRevokedUnexpired();
      if (valid.length === 0 && revoked.length === 0) {
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
      // Sweep stale markers for revoked tokens (DEL of an absent key is a no-op).
      for (const token of revoked) {
        pipeline.del(keyFor(token.jti));
      }
      await pipeline.exec();

      this.logger.info(`Reconciled restic validity into Redis (${valid.length} valid, ${revoked.length} revoked)`);
    } catch (error) {
      this.logger.error(error, 'Failed to reconcile restic validity into Redis');
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
