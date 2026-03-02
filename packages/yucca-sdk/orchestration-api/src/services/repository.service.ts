import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Backend } from '../backends/backend';
import {
  ListSnapshotsResponseDto,
  LocalRepositoryDto,
  LogResponseDto,
  RepositoryConfigurationDto,
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryMetricsDto,
  RepositoryWithMetricsDto,
  RunHistoryResponseDto,
} from '../dto/repository.dto';
import { TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { RepositoryLocalMetricsRepository } from '../repositories/repositoryLocalMetrics.repository';
import { RepositoryPathRepository } from '../repositories/repositoryPath.repository';
import { ResticRepository } from '../repositories/restic.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';
import { RunningTasksRepository } from '../repositories/runningTasks.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly tasks: RunningTasksRepository,
    private readonly events: EventsGateway,
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    private readonly restic: ResticRepository,
    private readonly runHistory: RunHistoryRepository,
    private readonly repository: RepositoryRepository,
    private readonly repositoryPath: RepositoryPathRepository,
    private readonly repositoryLocalMetrics: RepositoryLocalMetricsRepository,
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
  ) {}

  private async getLocalRepository(
    id: string,
    configuration?: RepositoryConfigurationDto,
    metrics?: RepositoryMetricsDto,
  ): Promise<Pick<LocalRepositoryDto, 'configuration' | 'metrics'>> {
    configuration ??= {
      paths: await this.repositoryPath.get(id),
    };
    metrics ??= await this.repositoryLocalMetrics.get(id);

    return {
      metrics,
      configuration,
    };
  }

  async createRepository(dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    const backends = await this.backend.getBackends();
    const defaultBackend = backends[0];
    const backend = Backend.from(defaultBackend.configuration, this.moduleConfig);

    const { repository: remote } = await backend.createRepository(dto);

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.init(endpoint, key);

    await this.repository.create({
      id: remote.id,
      backendId: defaultBackend.id,
    });

    const repository: LocalRepositoryDto = {
      ...(await this.getLocalRepository(remote.id, { paths: [] })),
      ...remote,
      backends: {
        primary: {
          id: defaultBackend.id,
          online: true,
          type: defaultBackend.configuration.type,
        },
        secondary: [],
      },
    };

    this.events.publish({
      type: 'RepositoryCreate',
      repository,
    });

    return {
      repository,
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
          ...(await this.getLocalRepository(id, configuration, metrics)),
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: true,
            },
            secondary: [],
          },
        });

        delete remoteRepositories[backendId][id];
      } else {
        repositories.push({
          id,
          name: 'Unknown',
          worm: false,
          ...(await this.getLocalRepository(id, configuration, metrics)),
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: false,
            },
            secondary: [],
          },
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

  private async getResticParameters(id: string): Promise<{ endpoint: string; key: Uint8Array }> {
    const localRepository = await this.repository.get(id);
    if (!localRepository) {
      throw new BadRequestException('Repository not found locally');
    }

    const backend = await this.backend.getBackend(localRepository.backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig);
    const endpoint = await backendInstance.getResticEndpoint(id);

    const key = await this.config.deriveEncryptionKey(`repository-${id}`);

    return { endpoint, key };
  }

  private async updateLocalMetrics(id: string, endpoint: string, key: Uint8Array): Promise<void> {
    try {
      return;
    } finally {
      const { total_size } = await this.restic.stats(endpoint, key);
      const metrics = {
        sizeBytes: total_size,
        lastBackup: new Date().toISOString(),
      };

      await this.repositoryLocalMetrics.save(id, metrics);

      this.events.publish({
        type: 'RepositoryUpdate',
        repositoryId: id,
        repository: {
          metrics,
        },
      });

      // debug
      // console.info(`RESTIC_PASSWORD=${key.toHex()} restic -r ${endpoint}`);
    }
  }

  async createBackup(id: string): Promise<LogResponseDto> {
    if (!this.tasks.canStart(id)) {
      throw new BadRequestException('Task already running!');
    }

    const { endpoint, key } = await this.getResticParameters(id);

    return await this.runHistory.createLog(
      id,
      async (log, logId) => {
        const paths = await this.repositoryPath.get(id);
        if (paths.length === 0) {
          throw new BadRequestException('Missing configuration paths');
        }

        try {
          this.tasks.startTask(id, TaskType.Backup, logId);
          await this.restic.backup(endpoint, key, paths, log);
        } finally {
          this.tasks.endTask(id);
        }
      },
      () => void this.updateLocalMetrics(id, endpoint, key),
    );
  }

  async addRepositoryPath(id: string, path: string): Promise<void> {
    await this.repositoryPath.create({ id, path });

    const paths = await this.repositoryPath.get(id);

    this.events.publish({
      type: 'RepositoryUpdate',
      repositoryId: id,
      repository: {
        configuration: {
          paths,
        },
      },
    });
  }

  async removeRepositoryPath(id: string, path: string): Promise<void> {
    await this.repositoryPath.delete(id, path);

    const paths = await this.repositoryPath.get(id);

    this.events.publish({
      type: 'RepositoryUpdate',
      repositoryId: id,
      repository: {
        configuration: {
          paths,
        },
      },
    });
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
    if (!this.tasks.canStart(id)) {
      throw new BadRequestException('Task already running!');
    }

    const { endpoint, key } = await this.getResticParameters(id);

    try {
      this.tasks.startTask(id, TaskType.Forget);
      await this.restic.forget(endpoint, key, snapshotId);
    } finally {
      this.tasks.endTask(id);
    }

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
