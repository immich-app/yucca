import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Backend } from '../backends/backend';
import {
  ListSnapshotsResponseDto,
  LocalRepositoryDto,
  RepositoryConfigurationDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryWithMetricsDto,
  RunHistoryResponseDto,
} from '../dto/repository.dto';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { RepositoryLocalMetricsRepository } from '../repositories/repositoryLocalMetrics.repository';
import { RepositoryPathRepository } from '../repositories/repositoryPath.repository';
import { ResticRepository } from '../repositories/restic.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    private readonly restic: ResticRepository,
    private readonly runHistory: RunHistoryRepository,
    private readonly repository: RepositoryRepository,
    private readonly repositoryPath: RepositoryPathRepository,
    private readonly repositoryLocalMetrics: RepositoryLocalMetricsRepository,
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
  ) {}

  async createRepository(): Promise<RepositoryCreateResponseDto> {
    const backends = await this.backend.getBackends();
    const defaultBackend = backends[0];
    const backend = Backend.from(defaultBackend.configuration, this.moduleConfig);

    const { repository } = await backend.createRepository(false);

    const endpoint = await backend.getResticEndpoint(repository.id);
    const key = await this.config.getEncryptionKey();
    await this.restic.init(endpoint, key);

    await this.repository.create({
      id: repository.id,
      backendId: defaultBackend.id,
    });

    return {
      repository: {
        ...repository,
        backends: {
          primary: {
            id: defaultBackend.id,
            online: true,
            type: defaultBackend.configuration.type,
          },
          secondary: [],
        },
        configuration: {
          paths: [],
        },
      },
    };
  }

  async getRepositories(): Promise<RepositoryListResponseDto> {
    const backends = await this.backend.getBackends();
    const repositories: LocalRepositoryDto[] = [];

    const backendsById = Object.fromEntries(backends.map((backend) => [backend.id, backend]));
    const remoteRepositories: Record<string, Record<string, RepositoryWithMetricsDto>> = {};

    for (const { id: backendId, configuration } of backends) {
      const backend = Backend.from(configuration, this.moduleConfig);
      remoteRepositories[backendId] = {};

      try {
        const { repositories: list } = await backend.getRepositories();

        for (const repository of list) {
          remoteRepositories[backendId][repository.id] = repository;
        }
      } catch (error) {
        console.error('Backend', backendId, 'threw', error);
      }
    }

    const localRepositories = await this.repository.getAll();
    const localPaths = await this.repositoryPath.getAll();
    const localMetrics = await this.repositoryLocalMetrics.getAll();

    for (const { id, backendId } of localRepositories) {
      const remoteRepository = remoteRepositories[backendId][id];

      const configuration: RepositoryConfigurationDto = {
        paths: localPaths.filter((entry) => entry.id === id).map(({ path }) => path),
      };

      const metrics = localMetrics.find((entry) => entry.id === id);

      if (remoteRepository) {
        repositories.push({
          ...remoteRepository,
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: true,
            },
            secondary: [],
          },
          configuration,
          metrics: metrics ?? remoteRepository.metrics,
        });

        delete remoteRepositories[backendId][id];
      } else {
        repositories.push({
          id,
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: false,
            },
            secondary: [],
          },
          metrics: metrics ?? {
            sizeBytes: 0,
          },
          worm: false,
          configuration,
        });
      }
    }

    for (const [backendId, list] of Object.entries(remoteRepositories)) {
      for (const remoteRepository of Object.values(list)) {
        repositories.push({
          ...remoteRepository,
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: true,
            },
            secondary: [],
          },
        });
      }
    }

    return {
      repositories,
    };
  }

  private async getResticParameters(id: string): Promise<{ endpoint: string; key: Buffer }> {
    const localRepository = await this.repository.get(id);
    if (!localRepository) {
      throw new BadRequestException('Repository not found locally');
    }

    const backend = await this.backend.getBackend(localRepository.backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig);
    const endpoint = await backendInstance.getResticEndpoint(id);

    const key = await this.config.getEncryptionKey();

    return { endpoint, key };
  }

  private async updateLocalMetrics(id: string, endpoint: string, key: Buffer): Promise<void> {
    try {
      return;
    } finally {
      const { total_size } = await this.restic.stats(endpoint, key);

      await this.repositoryLocalMetrics.save(id, {
        sizeBytes: total_size,
        lastBackup: new Date().toISOString(),
      });

      // debug
      console.info(`RESTIC_PASSWORD=${key.toString('hex')} restic -r ${endpoint}`);
    }
  }

  async createBackup(id: string): Promise<void> {
    const { endpoint, key } = await this.getResticParameters(id);

    const paths = await this.repositoryPath.get(id);
    if (paths.length === 0) {
      throw new BadRequestException('Missing configuration paths');
    }

    await this.runHistory.createLog(id, (log) => this.restic.backup(endpoint, key, paths, log));
    await this.updateLocalMetrics(id, endpoint, key);
  }

  async addRepositoryPath(id: string, path: string): Promise<void> {
    await this.repositoryPath.create({ id, path });
  }

  async removeRepositoryPath(id: string, path: string): Promise<void> {
    await this.repositoryPath.delete(id, path);
  }

  async getSnapshots(id: string): Promise<ListSnapshotsResponseDto> {
    const { endpoint, key } = await this.getResticParameters(id);
    const snapshots = await this.restic.snapshots(endpoint, key);

    return {
      snapshots: snapshots.map((snapshot) => ({
        ...snapshot,
        time: snapshot.time.toISOString(),
      })),
    };
  }

  async forgetSnapshot(id: string, snapshotId: string): Promise<void> {
    const { endpoint, key } = await this.getResticParameters(id);
    await this.restic.forget(endpoint, key, snapshotId);
    await this.updateLocalMetrics(id, endpoint, key);
  }

  async getRunHistory(id: string): Promise<RunHistoryResponseDto> {
    const runs = await this.runHistory.getAll(id);

    return {
      runs,
    };
  }

  observableLog(id: string): Observable<MessageEvent> {
    return this.runHistory.getObservable(id);
  }
}
