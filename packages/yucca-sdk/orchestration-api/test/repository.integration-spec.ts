import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { BackendRepository } from 'src/repositories/backend.repository';
import { RepositoryService } from 'src/services/repository.service';
import { createTestingModule, TestContext, waitForEvent } from './testUtils';

let ctx: TestContext;

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

    const metricsEvent = waitForEvent(ctx.events, 'RepositoryUpdate');

    const { logId, task } = await repositoryService.createBackup(repository.id);
    await task;

    expect(logId).toEqual(expect.any(String));

    await expect(metricsEvent).resolves.toEqual(
      expect.objectContaining({
        type: 'RepositoryUpdate',
        repositoryId: repository.id,
        repository: expect.objectContaining({
          metrics: expect.objectContaining({
            sizeBytes: 1024,
            lastBackup: expect.any(String),
            lastSuccessfulBackup: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('sets lastBackup but not lastSuccessfulBackup on failure', async () => {
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
          }),
        }),
      }),
    );
    expect((event as any).repository.metrics.lastSuccessfulBackup).toBeFalsy();
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
