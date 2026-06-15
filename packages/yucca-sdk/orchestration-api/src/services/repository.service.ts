import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
import { Updateable } from 'kysely';
import { randomUUID } from 'node:crypto';
import { type WriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
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
  RepositoryInspectResponseDto,
  RepositoryListResponseDto,
  RepositoryMetricsDto,
  RepositoryPrimaryBackendReconfigureRequestDto,
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
import { DEFAULT_RETENTION_POLICY, RetentionPolicy } from '../utils/restic';
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
    if (!configuration) {
      const [paths, { retentionPolicy }] = await Promise.all([this.repositoryPath.get(id), this.repository.get(id)]);
      configuration = { paths, retentionPolicy };
    }

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
    const id = randomUUID();

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.init(endpoint, key);

    await this.repository.create({
      id,
      remoteId: remote.id,
      backendId,
      retentionPolicy: DEFAULT_RETENTION_POLICY,
    });

    const paths = dto.paths ?? [];
    for (const path of paths) {
      await this.repositoryPath.create({ id, path });
    }

    const repository: LocalRepositoryDto = {
      ...(await this.getLocalRepository(id, { paths, retentionPolicy: DEFAULT_RETENTION_POLICY })),
      ...remote,
      id,
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

    for (const { id, remoteId, backendId, retentionPolicy } of localRepositories) {
      const remoteRepository = remoteRepositories[backendId][remoteId];

      const configuration: RepositoryConfigurationDto = {
        paths: localPaths.filter((entry) => entry.id === id).map(({ path }) => path),
        retentionPolicy,
      };

      const metrics = localMetrics.find((entry) => entry.id === id);

      if (remoteRepository) {
        repositories.push({
          ...remoteRepository,
          id,
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

        delete remoteRepositories[backendId][remoteId];
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

  async inspectRepositories(backendId?: string): Promise<RepositoryInspectResponseDto> {
    const { repositories } = await this.getRepositories();
    const list = repositories.filter(
      (repository) =>
        !repository.configuration &&
        repository.backends &&
        (!backendId || repository.backends.primary.id === backendId),
    );

    const snapshots = await Promise.allSettled(
      list.map(async (repository) => {
        const { endpoint, key } = await this.getResticParameters({
          backendId: repository.backends!.primary.id,
          remoteId: repository.id,
        });
        return this.restic.snapshots(endpoint, key);
      }),
    );

    return {
      repositories: list.map((repository, idx) => ({
        ...repository,
        snapshots:
          snapshots[idx].status === 'fulfilled'
            ? snapshots[idx].value.map((snapshot) => this.mapSnapshot(snapshot))
            : undefined,
      })),
    };
  }

  private mapSnapshot({ summary, ...snapshot }: Awaited<ReturnType<ResticRepository['snapshots']>>[number]) {
    return {
      ...snapshot,
      time: snapshot.time.toISOString(),
      summary: summary
        ? {
            filesNew: summary.files_new,
            filesChanged: summary.files_changed,
            filesUnmodified: summary.files_unmodified,
            totalFiles: summary.total_files_processed,
            totalBytes: summary.total_bytes_processed,
            dataAdded: summary.data_added,
          }
        : undefined,
    };
  }

  async updateRepository(
    id: string,
    dto: RepositoryUpdateRequestDto,
    backendId?: string,
  ): Promise<RepositoryUpdateResponseDto> {
    let remoteId: string;
    if (backendId) {
      remoteId = id;
    } else {
      const localRepository = await this.repository.get(id);
      backendId = localRepository.backendId;
      remoteId = localRepository.remoteId;
    }

    const backend = await this.backend.getBackend(backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig.get());

    let remote;
    if (dto.name) {
      ({ repository: remote } = await backendInstance.updateRepository(remoteId, dto));
    } else {
      ({ repository: remote } = await backendInstance.getRepository(remoteId));
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

    if (dto.retentionPolicy !== undefined) {
      await this.repository.update(id, { retentionPolicy: dto.retentionPolicy });
    }

    const metrics = await this.repositoryLocalMetrics.get(id);

    const repository: LocalRepositoryDto = {
      ...remote,
      id,
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

  private async getResticParameters(
    repository: string | { backendId: string; remoteId: string },
  ): Promise<{ endpoint: string; key: Uint8Array }> {
    let backendId: string;
    let remoteId: string;
    if (typeof repository === 'string') {
      const localRepository = await this.repository.get(repository);
      if (!localRepository) {
        throw new BadRequestException('Repository not found locally');
      }

      backendId = localRepository.backendId;
      remoteId = localRepository.remoteId;
    } else {
      ({ backendId, remoteId } = repository);
    }

    const backend = await this.backend.getBackend(backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig.get());
    const endpoint = await backendInstance.getResticEndpoint(remoteId);

    const key = await this.config.deriveEncryptionKey(`repository-${remoteId}`);

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
        const { backendId, remoteId } = await this.repository.get(id);
        const { configuration } = await this.backend.getBackend(backendId);
        const backend = Backend.from(configuration, this.moduleConfig.get());

        if (backend.isMetricsCapable()) {
          await backend.submitMetricRepositorySize(remoteId, metrics.sizeBytes);
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

    const { backendId, remoteId } = await this.repository.get(id);
    const { configuration } = await this.backend.getBackend(backendId);
    const backend = Backend.from(configuration, this.moduleConfig.get());

    const { endpoint, key } = await this.getResticParameters(id);

    const paths = await this.repositoryPath.get(id);
    if (paths.length === 0) {
      throw new BadRequestException('Missing configuration paths');
    }

    return new Promise((resolve) => {
      const startTime = Date.now();

      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createLog(
            id,
            TaskType.Backup,
            async (log, logId) => {
              resolve({
                task,
                logId,
              });

              if (backend.isMetricsCapable()) {
                await backend.submitMetricBackupStart(remoteId);
              }

              try {
                const taskSignal = this.tasks.startTask(id, TaskType.Backup, logId, signal);
                await this.restic.unlockAll(endpoint, key);
                await this.restic.backup(endpoint, key, paths, log, taskSignal);

                const { retentionPolicy: policy } = await this.repository.get(id);
                if (policy) {
                  await this.runForgetAndPrune(endpoint, key, policy, log, taskSignal);
                }
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

              if (backend.isMetricsCapable()) {
                await backend.submitMetricBackupEnd(remoteId, !error, lastBackupDuration);
              }
            },
          ),
      );

      task.catch(() => {});
    });
  }

  private async runForgetAndPrune(
    endpoint: string,
    key: Uint8Array,
    policy: RetentionPolicy,
    log: WriteStream,
    signal?: AbortSignal,
  ): Promise<void> {
    const events = await this.restic.forgetByPolicy(endpoint, key, policy, signal);

    for (const { keep, remove, reasons } of events) {
      if (keep) {
        for (const { id, time } of keep) {
          log.write(
            JSON.stringify({
              message_type: 'yucca_prune_kept',
              id,
              time,
              matches: reasons?.find((reason) => reason.snapshot.id === id)?.matches,
            }) + '\n',
          );
        }
      }

      if (remove) {
        for (const { id, time } of remove) {
          log.write(JSON.stringify({ message_type: 'yucca_prune_removed', id, time }) + '\n');
        }
      }
    }

    await this.restic.prune(endpoint, key, signal);
  }

  async pruneRepository(
    id: string,
    signal?: AbortSignal,
  ): Promise<{
    logId: string;
    task: Promise<void>;
  }> {
    if (!this.tasks.canStart(id)) {
      throw new BadRequestException('Task already running!');
    }

    const { retentionPolicy: policy } = await this.repository.get(id);
    if (!policy) {
      throw new BadRequestException('No retention policy configured for this repository');
    }

    const { endpoint, key } = await this.getResticParameters(id);

    return new Promise((resolve) => {
      const task = new Promise<void>(
        (complete, fail) =>
          void this.runHistory.createLog(
            id,
            TaskType.Forget,
            async (log, logId) => {
              resolve({ task, logId });

              try {
                const taskSignal = this.tasks.startTask(id, TaskType.Forget, logId, signal);
                await this.restic.unlockAll(endpoint, key);
                await this.runForgetAndPrune(endpoint, key, policy, log, taskSignal);
              } finally {
                this.tasks.endTask(id);
              }
            },
            (error) => {
              void this.updateLocalMetrics(id, {
                resticParameters: { endpoint, key },
              });

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

  async checkImportRepository(id: string, backendId: string): Promise<RepositoryCheckImportResponseDto> {
    const { endpoint, key } = await this.getResticParameters({ backendId, remoteId: id });

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
    const localId = randomUUID();

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.keyList(endpoint, key);

    let paths: string[] = [];
    try {
      const snapshots = await this.restic.snapshots(endpoint, key);
      snapshots.sort((a, b) => +b.time - +a.time);
      paths = snapshots[0].paths;
    } catch {
      // no-op
    }

    await this.repository.create({
      id: localId,
      remoteId: remote.id,
      backendId,
      retentionPolicy: DEFAULT_RETENTION_POLICY,
    });

    const repository: LocalRepositoryDto = {
      ...(await this.getLocalRepository(localId, { paths, retentionPolicy: DEFAULT_RETENTION_POLICY })),
      ...remote,
      id: localId,
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

  async reconfigureRepositoryPrimaryBackend(
    id: string,
    dto: RepositoryPrimaryBackendReconfigureRequestDto,
  ): Promise<RepositoryCreateResponseDto> {
    const { configuration } = await this.backend.getBackend(dto.backendId);
    const backend = Backend.from(configuration, this.moduleConfig.get());

    const { repository: remote } = await backend.createRepository({
      name: 'Restored Repository',
      worm: false,
    });

    const endpoint = await backend.getResticEndpoint(remote.id);
    const key = await this.config.deriveEncryptionKey(`repository-${remote.id}`);
    await this.restic.init(endpoint, key);

    await this.repository.update(id, {
      remoteId: remote.id,
      backendId: dto.backendId,
    });

    const { id: _, ...repository }: LocalRepositoryDto = {
      ...(await this.getLocalRepository(id)),
      ...remote,
      backends: {
        primary: {
          id: dto.backendId,
          online: true,
          type: configuration.type,
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
      repository: {
        id,
        ...repository,
      },
    };
  }

  async getSnapshots(id: string): Promise<ListSnapshotsResponseDto> {
    const { endpoint, key } = await this.getResticParameters(id);
    const snapshots = await this.restic.snapshots(endpoint, key);

    return {
      snapshots: snapshots.map((snapshot) => this.mapSnapshot(snapshot)),
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
            TaskType.Restore,
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

              const { endpoint, key } = await this.getResticParameters({ backendId, remoteId: id });

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
      await this.restic.unlockAll(endpoint, key);
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
