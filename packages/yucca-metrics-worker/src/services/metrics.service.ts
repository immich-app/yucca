import { LoggerRepository } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { env } from 'src/env';
import { MeterRepository } from 'src/repositories/meter.repository';
import { RgwRepository } from 'src/repositories/rgw.repository';
import { DB } from 'src/schema';

@Injectable()
export class MetricsService implements OnApplicationBootstrap {
  constructor(
    @InjectKysely() private db: Kysely<DB>,
    private logger: LoggerRepository,
    private rgw: RgwRepository,
    private meter: MeterRepository,
  ) {}

  async onApplicationBootstrap() {
    if (env.NODE_ENV === 'development') {
      await this.sync();
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sync() {
    try {
      this.logger.info(`Syncing from RadosGW...`);

      const stats = await this.rgw.getBucketStats();
      this.logger.info(`Fetched stats for ${stats.length} buckets`);

      const repositoryIds = new Set(
        (await this.db.selectFrom('repositories').select('id').execute()).map((row) => row.id),
      );

      for (const { bucket, bytes, objects } of stats) {
        if (!repositoryIds.has(bucket)) {
          this.logger.warn(`RGW bucket "${bucket}" has no matching repository; skipping`);
          continue;
        }

        await this.meter.record(bucket, { sizeBytes: bytes, objectCount: objects });
      }
    } catch (error) {
      this.logger.error(error, 'Failed to sync metrics from RadosGW');
    }
  }
}
