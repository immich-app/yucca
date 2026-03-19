import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Updateable } from 'kysely';
import { dirname } from 'node:path';
import { Observable } from 'rxjs';
import { Backend } from '../backends/backend';
import { FilesystemListingRequestDto, FilesystemListingResponseDto } from '../dto/filesystem.dto';
import {
  ListSnapshotsResponseDto,
  LocalRepositoryDto,
  RepositoryCheckImportResponseDto,
  RepositoryConfigurationDto,
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryMetricsDto,
  RepositorySnapshotRestoreRequestDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
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
import { RepositoryLocalMetricsTable } from '../schema/tables/repositoryLocalMetrics.table';

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

  async createRepository(dto: RepositoryCreateRequestDto, backendId?: string): Promise<RepositoryCreateResponseDto> {
    if (!backendId) {
      const backends = await this.backend.getBackends();
      backendId = backends[0].id;
    }

    const { configuration } = await this.backend.getBackend(backendId);
    const backend = Backend.from(configuration, this.moduleConfig);

    const { repository: remote } = await backend.createRepository(dto);

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.init(endpoint, key);

    await this.repository.create({
      id: remote.id,
      backendId,
    });

    const repository: LocalRepositoryDto = {
      ...(await this.getLocalRepository(remote.id, { paths: [] })),
      ...remote,
      backends: {
        primary: {
          id: backendId,
          online: true,
          type: configuration.type,
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

  async updateRepository(
    id: string,
    dto: RepositoryUpdateRequestDto,
    backendId?: string,
  ): Promise<RepositoryUpdateResponseDto> {
    if (!backendId) {
      const localRepository = await this.repository.get(id);
      backendId = localRepository.backendId;
    }

    const backend = await this.backend.getBackend(backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig);

    let remote;
    if (dto.name) {
      ({ repository: remote } = await backendInstance.updateRepository(id, dto));
    } else {
      ({ repository: remote } = await backendInstance.getRepository(id));
    }

    if (dto.paths) {
      const currentPaths = new Set(await this.repositoryPath.get(id));
      const requestedPaths = new Set(dto.paths);
      const removedPaths = currentPaths.difference(requestedPaths);
      const newPaths = requestedPaths.difference(currentPaths);

      for (const path of removedPaths) {
        await this.repositoryPath.delete(id, path);
      }

      for (const path of newPaths) {
        await this.repositoryPath.create({
          id,
          path,
        });
      }
    }

    const metrics = await this.repositoryLocalMetrics.get(id);

    const repository: LocalRepositoryDto = {
      ...remote,
      ...(await this.getLocalRepository(id, undefined, metrics)),
      backends: {
        primary: {
          id: backendId,
          type: backend.configuration.type,
          online: true,
        },
        secondary: [],
      },
    };

    this.events.publish({
      type: 'RepositoryUpdate',
      repositoryId: id,
      repository,
    });

    return {
      repository,
    };
  }

  private async getResticParameters(id: string, backendId?: string): Promise<{ endpoint: string; key: Uint8Array }> {
    if (!backendId) {
      const localRepository = await this.repository.get(id);
      if (!localRepository) {
        throw new BadRequestException('Repository not found locally');
      }

      backendId = localRepository.backendId;
    }

    const backend = await this.backend.getBackend(backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig);
    const endpoint = await backendInstance.getResticEndpoint(id);

    const key = await this.config.deriveEncryptionKey(`repository-${id}`);

    return { endpoint, key };
  }

  private async updateLocalMetrics(
    id: string,
    options: {
      resticParameters?: {
        endpoint: string;
        key: Uint8Array;
      };
      additionalMetrics?: Updateable<RepositoryLocalMetricsTable>;
    },
  ): Promise<void> {
    try {
      return;
    } finally {
      const metrics: Updateable<RepositoryLocalMetricsTable> = {
        ...options.additionalMetrics,
      };

      if (options.resticParameters) {
        const { endpoint, key } = options.resticParameters;
        const { total_size } = await this.restic.stats(endpoint, key);
        metrics.sizeBytes = total_size;
      }

      const updatedMetrics = await this.repositoryLocalMetrics.save(id, metrics);

      this.events.publish({
        type: 'RepositoryUpdate',
        repositoryId: id,
        repository: {
          metrics: updatedMetrics,
        },
      });

      // debug
      // console.info(`RESTIC_PASSWORD=${key.toHex()} restic -r ${endpoint}`);
    }
  }

  createBackup(id: string): Promise<{
    logId: string;
    task: Promise<void>;
  }> {
    if (!this.tasks.canStart(id)) {
      throw new BadRequestException('Task already running!');
    }

    return new Promise((resolve) => {
      let endpoint: string, key: Uint8Array;
      let startTime: number;

      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createLog(
            id,
            async (log, logId) => {
              resolve({
                task,
                logId,
              });

              startTime = Date.now();
              ({ endpoint, key } = await this.getResticParameters(id));

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
            (error) => {
              const lastBackup = new Date().toString();
              let lastSuccessfulBackup;
              const lastBackupDuration = startTime ? Date.now() - startTime : undefined;

              if (!error) {
                lastSuccessfulBackup = lastBackup;
              }

              void this.updateLocalMetrics(id, {
                resticParameters: endpoint ? { endpoint, key } : undefined,
                additionalMetrics: {
                  lastBackup: new Date().toString(),
                  lastSuccessfulBackup,
                  lastBackupDuration,
                },
              });

              if (error) {
                fail(error);
              } else {
                complete();
              }
            },
          ),
      );
    });
  }

  async checkImportRepository(id: string, backendId: string): Promise<RepositoryCheckImportResponseDto> {
    const { endpoint, key } = await this.getResticParameters(id, backendId);

    try {
      await this.restic.snapshots(endpoint, key);

      return {
        readable: true,
      };
    } catch {
      return {
        readable: false,
      };
    }
  }

  async importRepository(id: string, backendId: string): Promise<RepositoryCreateResponseDto> {
    const { configuration } = await this.backend.getBackend(backendId);
    const backend = Backend.from(configuration, this.moduleConfig);
    const { repository: remote } = await backend.getRepository(id);

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.keyList(endpoint, key);

    await this.repository.create({
      id: remote.id,
      backendId,
    });

    const repository: LocalRepositoryDto = {
      ...(await this.getLocalRepository(id, { paths: [] })),
      ...remote,
      backends: {
        primary: {
          id: backendId,
          online: true,
          type: configuration.type,
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

  async restoreSnapshot(
    id: string,
    snapshotId: string,
    dto: RepositorySnapshotRestoreRequestDto,
  ): Promise<{
    logId: string;
    task: Promise<void>;
  }> {
    return new Promise((resolve) => {
      let endpoint: string, key: Uint8Array;

      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createLog(
            id,
            async (log, logId) => {
              resolve({
                task,
                logId,
              });

              ({ endpoint, key } = await this.getResticParameters(id));

              try {
                this.tasks.startTask(id, TaskType.Backup, logId);
                await this.restic.restore(endpoint, key, snapshotId, dto, log);
              } finally {
                this.tasks.endTask(id);
              }
            },
            (error) => {
              if (error) {
                fail(error);
              } else {
                complete();
              }
            },
          ),
      );
    });
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

    await this.updateLocalMetrics(id, {
      resticParameters: { endpoint, key },
    });
  }

  async getSnapshotListing(
    id: string,
    snapshotId: string,
    dto: FilesystemListingRequestDto,
  ): Promise<FilesystemListingResponseDto> {
    const path = dto.path ?? '/';

    const { endpoint, key } = await this.getResticParameters(id);
    const files = await this.restic.ls(endpoint, key, snapshotId, path);

    return {
      parent: dirname(path),
      path,
      items: files
        .filter((file) => file.message_type === 'node')
        .filter((file) => file.path !== path)
        .map((file) => ({
          path: file.path,
          isDirectory: file.type === 'dir',
        })),
    };
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
