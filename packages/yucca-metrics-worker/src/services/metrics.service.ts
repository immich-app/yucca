import { LoggerRepository, MetricService } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Gauge } from '@opentelemetry/api';
import { env } from 'src/env';
import { MeterRepository } from 'src/repositories/meter.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RgwRepository } from 'src/repositories/rgw.repository';

@Injectable()
export class MetricsService implements OnApplicationBootstrap {
  private readonly repositorySizeBytes: Gauge;
  private readonly repositoryObjectCount: Gauge;

  constructor(
    private logger: LoggerRepository,
    private rgw: RgwRepository,
    private meter: MeterRepository,
    private repositories: RepositoryRepository,
    metricService: MetricService,
  ) {
    this.repositorySizeBytes = metricService.getGauge('rgw_repository_size_bytes', {
      description: 'Repository size in bytes',
    });
    this.repositoryObjectCount = metricService.getGauge('rgw_repository_object_count', {
      description: 'Number of objects in the repository',
    });
  }

  async onApplicationBootstrap() {
    if (env.NODE_ENV === 'development') {
      await this.sync();
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sync() {
    this.logger.info('Syncing from RadosGW...');

    try {
      const repositories = await this.repositories.getAll();
      const customerByRepository = new Map(repositories.map((repository) => [repository.id, repository.userId]));

      let count = 0;
      for await (const { bucket: repositoryId, bytes, objects } of this.rgw.getBucketStats()) {
        count++;

        const customerId = customerByRepository.get(repositoryId);
        if (!customerId) {
          this.logger.warn(`RGW bucket "${repositoryId}" has no matching repository; skipping`);
          continue;
        }

        await this.meter.record(repositoryId, { sizeBytes: bytes, objectCount: objects });

        this.repositorySizeBytes.record(bytes, { repositoryId, customerId });
        this.repositoryObjectCount.record(objects, { repositoryId, customerId });
      }

      this.logger.info(`Synced stats for ${count} buckets`);
    } catch (error) {
      this.logger.error(error, 'Failed to sync metrics from RadosGW');
    }
  }
}
