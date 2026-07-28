import { billableBytes } from '@common/server';
import { LoggerRepository, MetricService } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Gauge } from '@opentelemetry/api';
import { env } from 'src/env';
import { ConnectionMetricsRepository } from 'src/repositories/connectionMetrics.repository';
import { MeterRepository } from 'src/repositories/meter.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RgwRepository } from 'src/repositories/rgw.repository';

@Injectable()
export class MetricsService implements OnApplicationBootstrap {
  private readonly repositorySizeBytes: Gauge;
  private readonly repositoryObjectCount: Gauge;
  private readonly connectionBillableBytes: Gauge;

  constructor(
    private logger: LoggerRepository,
    private rgw: RgwRepository,
    private meter: MeterRepository,
    private repositories: RepositoryRepository,
    private connectionMetrics: ConnectionMetricsRepository,
    metricService: MetricService,
  ) {
    this.repositorySizeBytes = metricService.getGauge('rgw_repository_size_bytes', {
      description: 'Repository size in bytes',
    });
    this.repositoryObjectCount = metricService.getGauge('rgw_repository_object_count', {
      description: 'Number of objects in the repository',
    });
    this.connectionBillableBytes = metricService.getGauge('connection_billable_bytes', {
      description: 'Billable bytes rolled up per connection (min-object-size floor applied)',
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

      await this.rollupConnections();
    } catch (error) {
      this.logger.error(error, 'Failed to sync metrics from RadosGW');
    }
  }

  /**
   * Roll the per-repository meter readings up to each connection and apply the type-aware billing
   * floor (immich bills raw bytes; non-immich pay a min-object-size floor — see `billableBytes`).
   * The result is the storage-tier bill per connection, the always-available metering tier.
   */
  private async rollupConnections() {
    const rollups = await this.connectionMetrics.getRollups();

    for (const { connectionId, type, sizeBytes, objectCount, repositoryCount } of rollups) {
      const billable = billableBytes(type, sizeBytes, objectCount);

      await this.connectionMetrics.upsert({
        connectionId,
        sizeBytes,
        objectCount,
        billableBytes: billable,
        repositoryCount,
      });

      this.connectionBillableBytes.record(billable, { connectionId, connectionType: type });
    }

    this.logger.info(`Rolled up ${rollups.length} connections`);
  }
}
