import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import { Updateable } from 'kysely';
import { dirname, join } from 'node:path';
import { Observable } from 'rxjs';
import { Backend } from '../backends/backend';
import { FilesystemListingRequestDto, FilesystemListingResponseDto } from '../dto/filesystem.dto';
import {
  InspectedLocalRepositoryDto,
  ListSnapshotsResponseDto,
  LocalRepositoryDto,
  RepositoryCheckImportResponseDto,
  RepositoryConfigurationDto,
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryInspectResponseDto,
  RepositoryListResponseDto,
  RepositoryMetricsDto,
  RepositorySnapshotRestoreFromPointRequestDto,
  RepositorySnapshotRestoreRequestDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RepositoryWithMetricsDto,
  RunHistoryResponseDto,
} from '../dto/repository.dto';
import { TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { RepositoryLocalMetricsRepository } from '../repositories/repositoryLocalMetrics.repository';
import { RepositoryPathRepository } from '../repositories/repositoryPath.repository';
import { ResticRepository } from '../repositories/restic.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';
import { RunningTasksRepository } from '../repositories/runningTasks.repository';
import { StorageRepository } from '../repositories/storage.repository';
import { RepositoryLocalMetricsTable } from '../schema/tables/repositoryLocalMetrics.table';
import { BootstrapService } from './bootstrap.service';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly tasks: RunningTasksRepository,
    private readonly events: EventsGateway,
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    private readonly database: DatabaseRepository,
    private readonly restic: ResticRepository,
    private readonly runHistory: RunHistoryRepository,
    private readonly repository: RepositoryRepository,
    private readonly repositoryPath: RepositoryPathRepository,
    private readonly repositoryLocalMetrics: RepositoryLocalMetricsRepository,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly storage: StorageRepository,
    @Inject(forwardRef(() => BootstrapService))
    private readonly bootstrap: BootstrapService,
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
    const backend = Backend.from(configuration, this.moduleConfig.get());

    const { repository: remote } = await backend.createRepository(dto);

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.init(endpoint, key);

    await this.repository.create({
      id: remote.id,
      backendId,
    });

    const paths = dto.paths ?? [];
    for (const path of paths) {
      await this.repositoryPath.create({ id: remote.id, path });
    }

    const repository: LocalRepositoryDto = {
      ...(await this.getLocalRepository(remote.id, { paths })),
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
      const backend = Backend.from(configuration, this.moduleConfig.get());
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

  async inspectRepositories(): Promise<RepositoryInspectResponseDto> {
    const { repositories } = await this.getRepositories();

    const snapshots = await Promise.allSettled(
      repositories.map(async (repository) => {
        const { endpoint, key } = await this.getResticParameters(repository.id, repository.backends?.primary.id);
        return this.restic.snapshots(endpoint, key);
      }),
    );

    return {
      repositories: repositories.map(
        (repository, idx) =>
          ({
            ...repository,
            snapshots: snapshots[idx].status === 'fulfilled' ? snapshots[idx].value : undefined,
          }) as InspectedLocalRepositoryDto,
      ),
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
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig.get());

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

  async deleteRepository(id: string): Promise<void> {
    await this.repository.delete(id);

    this.events.publish({
      type: 'RepositoryDelete',
      repositoryId: id,
    });
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
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig.get());
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
    const metrics: Updateable<RepositoryLocalMetricsTable> = {
      ...options.additionalMetrics,
    };

    try {
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

      if (metrics.sizeBytes) {
        const { backendId } = await this.repository.get(id);
        const { configuration } = await this.backend.getBackend(backendId);
        const backend = Backend.from(configuration, this.moduleConfig.get());

        if (backend.isMetricsCapable()) {
          await backend.submitMetricRepositorySize(id, metrics.sizeBytes);
        }

        // ... in the future, this should push to all mirrors too
      }
    } catch {
      // no-op
    }
  }

  async createBackup(
    id: string,
    signal?: AbortSignal,
  ): Promise<{
    logId: string;
    task: Promise<void>;
  }> {
    if (!this.tasks.canStart(id)) {
      throw new BadRequestException('Task already running!');
    }

    const paths = await this.repositoryPath.get(id);
    if (paths.length === 0) {
      throw new BadRequestException('Missing configuration paths');
    }

    const { endpoint, key } = await this.getResticParameters(id);

    return new Promise((resolve) => {
      const startTime = Date.now();

      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createLog(
            id,
            async (log, logId) => {
              resolve({
                task,
                logId,
              });

              try {
                const taskSignal = this.tasks.startTask(id, TaskType.Backup, logId, signal);
                await this.restic.backup(endpoint, key, paths, log, taskSignal);
              } finally {
                this.tasks.endTask(id);
              }
            },
            async (error) => {
              const lastBackup = new Date().toISOString();
              const lastSuccessfulBackup = error ? undefined : lastBackup;
              const lastBackupDuration = Date.now() - startTime;

              void this.updateLocalMetrics(id, {
                resticParameters: { endpoint, key },
                additionalMetrics: {
                  lastBackup,
                  lastSuccessfulBackup,
                  lastBackupDuration,
                },
              });

              if (error) {
                fail(error);
              } else {
                complete();
              }

              const { backendId } = await this.repository.get(id);
              const { configuration } = await this.backend.getBackend(backendId);
              const backend = Backend.from(configuration, this.moduleConfig.get());

              if (backend.isMetricsCapable()) {
                await backend.submitMetricBackupEnd(id, !error, lastBackupDuration);
              }
            },
          ),
      );

      task.catch(() => {});
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
    const backend = Backend.from(configuration, this.moduleConfig.get());
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
      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createLog(
            id,
            async (log, logId) => {
              resolve({
                task,
                logId,
              });

              const { endpoint, key } = await this.getResticParameters(id);

              try {
                const signal = this.tasks.startTask(id, TaskType.Restore, logId);
                await this.restic.restore(endpoint, key, snapshotId, dto, log, signal);
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

      task.catch(() => {});
    });
  }

  async restoreFromPoint(
    id: string,
    snapshotId: string,
    backendId: string,
    dto: RepositorySnapshotRestoreFromPointRequestDto,
  ): Promise<{
    logId: string;
    task: Promise<void>;
  }> {
    return new Promise((resolve) => {
      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createEphemeralLog(
            async (log, logId) => {
              resolve({
                task,
                logId,
              });

              const { endpoint, key } = await this.getResticParameters(id, backendId);

              try {
                const signal = this.tasks.startTask(id, TaskType.Restore, logId);
                await this.restic.restore(endpoint, key, snapshotId, { include: dto.include }, log, signal);

                if (dto.yuccaConfig) {
                  const target = await this.storage.tempdir();

                  await this.restic.restore(
                    endpoint,
                    key,
                    snapshotId,
                    { include: [dto.yuccaConfig], target },
                    log,
                    signal,
                  );

                  const { statePath } = this.moduleConfig.get();
                  const restoredState = join(target, dto.yuccaConfig);

                  await this.storage.cp(restoredState, statePath, {
                    recursive: true,
                    filter: (src) => !src.endsWith('.sqlite3'),
                  });

                  await this.database.restoreFrom(join(restoredState, 'state.sqlite3'));

                  await this.bootstrap.onApplicationBootstrap();
                }
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

      task.catch(() => {});
    });
  }

  async forgetSnapshot(id: string, snapshotId: string): Promise<void> {
    if (!this.tasks.canStart(id)) {
      throw new BadRequestException('Task already running!');
    }

    const { endpoint, key } = await this.getResticParameters(id);

    try {
      const signal = this.tasks.startTask(id, TaskType.Forget);
      await this.restic.forget(endpoint, key, snapshotId, true, signal);
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
