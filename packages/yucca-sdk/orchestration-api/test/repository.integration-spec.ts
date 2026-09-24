import { createRepository, createResticUrl, getRepository } from '@futo-org/backups-api-client';
import { ResticBackupCommandCouldNotReadSourceDataError } from '@futo-org/restic-wrapper';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { BackendType, TaskStatus } from 'src/enum';
import { ResticProxyPool } from 'src/proxy/resticProxyPool';
import { BackendRepository } from 'src/repositories/backend.repository';
import { ModuleConfigRepository } from 'src/repositories/moduleConfig.repository';
import { RepositoryIntegrationImmichRepository } from 'src/repositories/repositoryIntegrationImmich.repository';
import { IntegrationsService } from 'src/services/integrations.service';
import { RepositoryService } from 'src/services/repository.service';
import { newImmichHooksMock } from './mocks';
import { createTestingModule, TestContext, waitForEvent } from './testUtils';

let ctx: TestContext;

const configureImmich = async (hooks: Partial<ReturnType<typeof newImmichHooksMock>>) => {
  const integrationsService = ctx.module.get(IntegrationsService);
  const moduleConfig = ctx.module.get(ModuleConfigRepository);
  const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);

  moduleConfig.update({
    immichIntegration: {
      dataPath: '/data/immich',
      dataFolders: ['upload'],
      libraries: [],
      hooks: { ...newImmichHooksMock(), ...hooks },
    },
  });

  await integrationsService.configureImmichIntegration({
    name: 'Immich Backup',
    worm: false,
    cron: '0 2 * * *',
    dataFolders: ['upload'],
    backupConfiguration: false,
    libraries: 'all',
  });

  const integration = await immichRepository.get();

  return {
    repositoryId: integration!.id,
    teardown: async () => {
      await immichRepository.delete();
      moduleConfig.update({ immichIntegration: undefined });
    },
  };
};

const backupWithHooks = async (hooks: Partial<ReturnType<typeof newImmichHooksMock>>) => {
  const repositoryService = ctx.module.get(RepositoryService);
  const { repositoryId, teardown } = await configureImmich(hooks);

  try {
    const { task } = await repositoryService.createBackup(repositoryId);
    await task;
  } finally {
    await teardown();
  }
};

beforeAll(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterAll(async () => {
  await ctx.app.close();
});

describe('Repository', () => {
  beforeEach(() => {
    ctx.resticMock.backup.mockReset();
    ctx.resticMock.forget.mockReset();
    ctx.resticMock.stats.mockResolvedValue({ total_size: 1024, snapshots_count: 1 });
  });

  it('rejects backup when task is already running', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository(
      { name: 'Conflict Repo', worm: false, paths: ['/tmp/conflict'] },
      ctx.backendId,
    );

    ctx.resticMock.backup.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)));

    const pendingBackup = repositoryService.createBackup(repository.id);
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(repositoryService.createBackup(repository.id)).rejects.toThrow('Task already running!');

    const { task } = await pendingBackup;
    await task;
  });

  it('rejects backup when no paths are configured', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository(
      { name: 'No Paths Repo', worm: false },
      ctx.backendId,
    );

    await expect(repositoryService.createBackup(repository.id)).rejects.toThrow('Missing configuration paths');
  });

  it('updates metrics after successful backup', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository(
      { name: 'Metrics Repo', worm: false, paths: ['/tmp/metrics'] },
      ctx.backendId,
    );

    const statusEvent = waitForEvent(ctx.events, 'RepositoryUpdate');
    const sizeEvent = waitForEvent(
      ctx.events,
      'RepositoryUpdate',
      (event) => event.type === 'RepositoryUpdate' && event.repository.metrics?.sizeBytes === 1024,
    );

    const { logId, task } = await repositoryService.createBackup(repository.id);
    await task;

    expect(logId).toEqual(expect.any(String));

    await expect(statusEvent).resolves.toEqual(
      expect.objectContaining({
        type: 'RepositoryUpdate',
        repositoryId: repository.id,
        repository: expect.objectContaining({
          metrics: expect.objectContaining({
            sizeBytes: 0,
            lastBackup: expect.any(String),
            lastBackupStatus: TaskStatus.Complete,
          }),
        }),
      }),
    );

    await expect(sizeEvent).resolves.toEqual(
      expect.objectContaining({
        type: 'RepositoryUpdate',
        repositoryId: repository.id,
        repository: expect.objectContaining({
          metrics: expect.objectContaining({
            sizeBytes: 1024,
            lastBackup: expect.any(String),
            lastBackupStatus: TaskStatus.Complete,
          }),
        }),
      }),
    );
  });

  describe('Immich integration hooks', () => {
    it('passes the task abort signal to the database backup hook and tags the snapshot', async () => {
      const createDatabaseBackup = jest.fn().mockResolvedValue('dump.sql.gz');

      await backupWithHooks({ createDatabaseBackup });

      expect(createDatabaseBackup).toHaveBeenCalledWith(expect.any(AbortSignal));
      expect(ctx.resticMock.backup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.any(AbortSignal),
        ['yucca.v1.immichBackupFileName=dump.sql.gz'],
      );
    });

    it('runs cleanup after the backup succeeds', async () => {
      const cleanupDatabaseBackups = jest.fn();

      await backupWithHooks({
        createDatabaseBackup: jest.fn().mockResolvedValue('dump.sql.gz'),
        cleanupDatabaseBackups,
      });

      expect(cleanupDatabaseBackups).toHaveBeenCalledTimes(1);
      expect(cleanupDatabaseBackups.mock.invocationCallOrder[0]).toBeGreaterThan(
        ctx.resticMock.backup.mock.invocationCallOrder[0],
      );
    });

    it('skips cleanup when the backup fails', async () => {
      const cleanupDatabaseBackups = jest.fn();
      ctx.resticMock.backup.mockRejectedValue(new Error('Backup failed'));

      await expect(backupWithHooks({ cleanupDatabaseBackups })).rejects.toThrow('Backup failed');

      expect(cleanupDatabaseBackups).not.toHaveBeenCalled();
    });

    it('still backs up without a tag when the database backup hook fails', async () => {
      await backupWithHooks({ createDatabaseBackup: jest.fn().mockRejectedValue(new Error('pg_dump failed')) });

      expect(ctx.resticMock.backup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.any(AbortSignal),
        [],
      );
    });

    it('completes the backup when cleanup rejects', async () => {
      await expect(
        backupWithHooks({ cleanupDatabaseBackups: jest.fn().mockRejectedValue(new Error('locked')) }),
      ).resolves.toBeUndefined();
    });
  });

  it('sets lastBackupStatus to failed on failure', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository(
      { name: 'Fail Metrics Repo', worm: false, paths: ['/tmp/fail-metrics'] },
      ctx.backendId,
    );

    ctx.resticMock.backup.mockRejectedValue(new Error('Backup failed'));

    const metricsEvent = waitForEvent(ctx.events, 'RepositoryUpdate');

    const { task } = await repositoryService.createBackup(repository.id);
    await task.catch(() => {});

    const event = await metricsEvent;
    expect(event).toEqual(
      expect.objectContaining({
        type: 'RepositoryUpdate',
        repositoryId: repository.id,
        repository: expect.objectContaining({
          metrics: expect.objectContaining({
            lastBackup: expect.any(String),
            lastBackupStatus: TaskStatus.Failed,
          }),
        }),
      }),
    );
  });

  it('reports warn without rejecting when source data could not be read', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository(
      { name: 'Warn Metrics Repo', worm: false, paths: ['/tmp/warn-metrics'] },
      ctx.backendId,
    );

    ctx.resticMock.backup.mockRejectedValue(new ResticBackupCommandCouldNotReadSourceDataError('unreadable'));

    const metricsEvent = waitForEvent(ctx.events, 'RepositoryUpdate');

    const { task } = await repositoryService.createBackup(repository.id);
    await task.catch(() => {});

    await expect(metricsEvent).resolves.toEqual(
      expect.objectContaining({
        type: 'RepositoryUpdate',
        repositoryId: repository.id,
        repository: expect.objectContaining({
          metrics: expect.objectContaining({
            lastBackup: expect.any(String),
            lastBackupStatus: TaskStatus.Warn,
          }),
        }),
      }),
    );
  });

  it('shows offline status when backend errors', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const backendRepository = ctx.module.get(BackendRepository);

    const { repository } = await repositoryService.createRepository(
      { name: 'Offline Test', worm: false },
      ctx.backendId,
    );

    await backendRepository.updateBackend(ctx.backendId, {
      type: 'local' as any,
      path: '/nonexistent/broken/path',
    });

    const { repositories } = await repositoryService.getRepositories();
    const offlineRepo = repositories.find((repo) => repo.id === repository.id);

    expect(offlineRepo).toBeDefined();
    expect(offlineRepo?.backends?.primary.online).toBe(false);
    expect(offlineRepo?.name).toBe('Unknown');

    await backendRepository.updateBackend(ctx.backendId, {
      type: 'local' as any,
      path: ctx.backendPath,
    });
  });

  it('lists remote-only repositories not in local database', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const remoteOnlyId = randomUUID();
    await mkdir(`${ctx.backendPath}/${remoteOnlyId}`, { recursive: true });

    const { repositories } = await repositoryService.getRepositories();
    const remoteOnly = repositories.find((repo) => repo.id === remoteOnlyId);

    expect(remoteOnly).toBeDefined();
    expect(remoteOnly?.name).toBe('Unknown');
    expect(remoteOnly?.backends?.primary.online).toBe(true);
  });

  it('rejects forget when task is already running', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository(
      { name: 'Forget Conflict', worm: false, paths: ['/tmp/forget'] },
      ctx.backendId,
    );

    ctx.resticMock.backup.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)));

    const pendingBackup = repositoryService.createBackup(repository.id);
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(repositoryService.forgetSnapshot(repository.id, 'any-snapshot')).rejects.toThrow(
      'Task already running!',
    );

    const { task } = await pendingBackup;
    await task;
  });
});

const remoteRepository = (id: string, name: string) => ({
  repository: {
    id,
    name,
    worm: false,
    siteCode: null,
    storageClusterCode: null,
    connectionId: '',
    connectionType: 'restic',
    metrics: { sizeBytes: 0 },
  },
});

describe('Primary backend reconfiguration', () => {
  beforeEach(() => {
    ctx.resticMock.init.mockReset();
    jest.spyOn(ResticProxyPool.prototype, 'isAvailable').mockResolvedValue(false);
    (createResticUrl as jest.Mock).mockResolvedValue({ url: 'rest:http://yucca.test/restic' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the repository name when moving to another backend', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const yuccaBackendId = randomUUID();
    await ctx.module.get(BackendRepository).updateBackend(yuccaBackendId, {
      type: BackendType.Yucca,
      url: 'http://yucca.test',
      accessToken: 'test-token',
    });

    const remoteId = randomUUID();
    (createRepository as jest.Mock).mockResolvedValueOnce(remoteRepository(remoteId, 'Family Photos'));
    (getRepository as jest.Mock).mockResolvedValueOnce(remoteRepository(remoteId, 'Family Photos'));
    const { repository } = await repositoryService.createRepository(
      { name: 'Family Photos', worm: false },
      yuccaBackendId,
    );

    const { repository: moved } = await repositoryService.reconfigureRepositoryPrimaryBackend(repository.id, {
      backendId: ctx.backendId,
    });

    expect(getRepository).toHaveBeenCalledWith(remoteId, expect.any(Object));
    expect(moved).toEqual(expect.objectContaining({ id: repository.id, name: 'Family Photos' }));
  });

  it('names the repository as restored when the old backend cannot report its name', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const { repository } = await repositoryService.createRepository({ name: 'Local Only', worm: false }, ctx.backendId);

    const { repository: moved } = await repositoryService.reconfigureRepositoryPrimaryBackend(repository.id, {
      backendId: ctx.backendId,
    });

    expect(moved.name).toBe('Restored Repository');
  });

  it('rejects an unknown repository before creating anything on the new backend', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const entriesBefore = await readdir(ctx.backendPath);

    await expect(
      repositoryService.reconfigureRepositoryPrimaryBackend(randomUUID(), { backendId: ctx.backendId }),
    ).rejects.toThrow('Repository not found locally');

    await expect(readdir(ctx.backendPath)).resolves.toEqual(entriesBefore);
    expect(ctx.resticMock.init).not.toHaveBeenCalled();
  });
});
