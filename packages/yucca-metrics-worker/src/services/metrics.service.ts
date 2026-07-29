import { LoggerRepository, MetricService } from '@common/server/otel';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Gauge } from '@opentelemetry/api';
import { env } from 'src/env';
import { MeterRepository } from 'src/repositories/meter.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RgwFleetRepository } from 'src/repositories/rgwFleet.repository';

@Injectable()
export class MetricsService implements OnApplicationBootstrap {
  private readonly repositorySizeBytes: Gauge;
  private readonly repositoryObjectCount: Gauge;

  constructor(
    private logger: LoggerRepository,
    private fleet: RgwFleetRepository,
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
    const repositories = await this.repositories.getAll().catch((error: unknown) => {
      this.logger.error(error, 'Failed to list repositories; skipping sync');
      return null;
    });
    if (!repositories) {
      return;
    }
    const repositoryById = new Map(repositories.map((repository) => [repository.id, repository]));

    // Each cluster syncs independently: one unreachable RGW must not stop the
    // meters of the others.
    let clusters: ReturnType<RgwFleetRepository['clusters']>;
    try {
      clusters = this.fleet.clusters();
    } catch (error) {
      this.logger.error(error, 'Failed to load cluster topology; skipping sync');
      return;
    }

    for (const { siteCode, clusterCode, rgw } of clusters) {
      this.logger.info(`Syncing from RadosGW (site ${siteCode}, cluster ${clusterCode})...`);

      try {
        let count = 0;
        for await (const { bucket: repositoryId, bytes, objects } of rgw.getBucketStats()) {
          count++;

          const repository = repositoryById.get(repositoryId);
          if (!repository) {
            this.logger.warn(
              `RGW bucket "${repositoryId}" (cluster ${clusterCode}) has no matching repository; skipping`,
            );
            continue;
          }
          if (repository.siteCode !== siteCode || repository.storageClusterCode !== clusterCode) {
            this.logger.warn(
              `RGW bucket "${repositoryId}" is in ${siteCode}/${clusterCode}, but its repository is assigned to ` +
                `${repository.siteCode}/${repository.storageClusterCode}; skipping`,
            );
            continue;
          }

          await this.meter.record(repositoryId, {
            sizeBytes: bytes,
            objectCount: objects,
            storageClusterCode: clusterCode,
          });

          this.repositorySizeBytes.record(bytes, {
            repositoryId,
            customerId: repository.userId,
            site: siteCode,
            cluster: clusterCode,
          });
          this.repositoryObjectCount.record(objects, {
            repositoryId,
            customerId: repository.userId,
            site: siteCode,
            cluster: clusterCode,
          });
        }

        this.logger.info(`Synced stats for ${count} buckets from cluster ${clusterCode}`);
      } catch (error) {
        this.logger.error(error, `Failed to sync metrics from RadosGW cluster ${clusterCode}`);
      }
    }
  }
}
