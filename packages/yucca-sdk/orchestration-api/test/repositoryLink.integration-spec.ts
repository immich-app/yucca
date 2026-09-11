import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { ModuleConfigRepository } from 'src/repositories/moduleConfig.repository';
import { RepositoryIntegrationImmichRepository } from 'src/repositories/repositoryIntegrationImmich.repository';
import { RepositoryPathRepository } from 'src/repositories/repositoryPath.repository';
import { IntegrationsService } from 'src/services/integrations.service';
import { RepositoryService } from 'src/services/repository.service';
import { ScheduleService } from 'src/services/schedule.service';
import { createTestingModule, TestContext } from './testUtils';

let ctx: TestContext;

const createRemoteRepository = async () => {
  const remoteId = randomUUID();
  await mkdir(`${ctx.backendPath}/${remoteId}`, { recursive: true });
  return remoteId;
};

beforeAll(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterAll(async () => {
  await ctx.app.close();
});

describe('Repository linking', () => {
  beforeEach(() => {
    ctx.resticMock.init.mockReset();
    ctx.resticMock.keyList.mockReset().mockResolvedValue([{ id: 'key-1', current: true }]);
    ctx.resticMock.snapshots.mockReset().mockResolvedValue([]);
  });

  it('links an existing remote repository without creating or initialising one', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const remoteId = await createRemoteRepository();

    const before = await repositoryService.getRepositories();
    expect(before.repositories.find((entry) => entry.id === remoteId)?.configuration).toBeUndefined();

    const { repository } = await repositoryService.linkRepository({ remoteId }, ctx.backendId);

    expect(repository.id).not.toBe(remoteId);
    expect(ctx.resticMock.init).not.toHaveBeenCalled();
    expect(ctx.resticMock.keyList).toHaveBeenCalled();

    const after = await repositoryService.getRepositories();
    const linked = after.repositories.find((entry) => entry.id === repository.id);

    expect(linked?.configuration).toBeDefined();
    expect(after.repositories.find((entry) => entry.id === remoteId)).toBeUndefined();
  });

  it('persists the paths supplied when linking', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const repositoryPaths = ctx.module.get(RepositoryPathRepository);

    const remoteId = await createRemoteRepository();

    const { repository } = await repositoryService.linkRepository({ remoteId, paths: ['/mnt/photos'] }, ctx.backendId);

    await expect(repositoryPaths.get(repository.id)).resolves.toEqual(['/mnt/photos']);
  });

  it('infers the paths from the newest snapshot when none are supplied', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const repositoryPaths = ctx.module.get(RepositoryPathRepository);

    const remoteId = await createRemoteRepository();

    ctx.resticMock.snapshots.mockResolvedValue([
      { id: 'old', time: new Date('2026-01-01'), paths: ['/mnt/old'], tags: [] },
      { id: 'new', time: new Date('2026-02-01'), paths: ['/mnt/new'], tags: [] },
    ] as never);

    const { repository } = await repositoryService.linkRepository({ remoteId }, ctx.backendId);

    await expect(repositoryPaths.get(repository.id)).resolves.toEqual(['/mnt/new']);
  });

  it('refuses to link when the derived key cannot open the repository', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const remoteId = await createRemoteRepository();
    ctx.resticMock.keyList.mockRejectedValue(new Error('wrong password'));

    await expect(repositoryService.linkRepository({ remoteId }, ctx.backendId)).rejects.toThrow('could not be opened');

    const { repositories } = await repositoryService.getRepositories();
    expect(repositories.find((entry) => entry.id === remoteId)?.configuration).toBeUndefined();
  });

  it('refuses to link a repository twice', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    const remoteId = await createRemoteRepository();
    await repositoryService.linkRepository({ remoteId }, ctx.backendId);

    await expect(repositoryService.linkRepository({ remoteId }, ctx.backendId)).rejects.toThrow('already linked');
  });

  it('refuses to link a repository the backend does not have', async () => {
    const repositoryService = ctx.module.get(RepositoryService);

    await expect(repositoryService.linkRepository({ remoteId: randomUUID() }, ctx.backendId)).rejects.toThrow(
      'not found on the backend',
    );
  });
});

describe('Immich integration repository binding', () => {
  const immichState = {
    dataPath: '/data/immich',
    dataFolders: ['upload'],
    libraries: [],
  };

  const configuration = {
    name: 'Immich Backup',
    worm: false,
    cron: '0 2 * * *',
    dataFolders: ['upload'],
    backupConfiguration: false,
    libraries: 'all' as const,
  };

  beforeEach(() => {
    ctx.resticMock.init.mockReset();
    ctx.resticMock.keyList.mockReset().mockResolvedValue([{ id: 'key-1', current: true }]);
    ctx.resticMock.snapshots.mockReset().mockResolvedValue([]);
    ctx.module.get(ModuleConfigRepository).update({ immichIntegration: immichState });
  });

  afterEach(async () => {
    await ctx.module.get(RepositoryIntegrationImmichRepository).delete();
    ctx.module.get(ModuleConfigRepository).update({ immichIntegration: undefined });
  });

  it('binds to an existing repository instead of creating a new one', async () => {
    const integrationsService = ctx.module.get(IntegrationsService);
    const repositoryService = ctx.module.get(RepositoryService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);

    const remoteId = await createRemoteRepository();
    const { repository } = await repositoryService.linkRepository({ remoteId }, ctx.backendId);

    await integrationsService.configureImmichIntegration({ ...configuration, repositoryId: repository.id });

    const integration = await immichRepository.get();
    expect(integration?.id).toBe(repository.id);
  });

  it('re-points an existing binding at another repository', async () => {
    const integrationsService = ctx.module.get(IntegrationsService);
    const repositoryService = ctx.module.get(RepositoryService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);
    const scheduleService = ctx.module.get(ScheduleService);

    await integrationsService.configureImmichIntegration(configuration);
    const first = await immichRepository.get();

    const remoteId = await createRemoteRepository();
    const { repository } = await repositoryService.linkRepository({ remoteId }, ctx.backendId);

    await integrationsService.configureImmichIntegration({ ...configuration, repositoryId: repository.id });

    const second = await immichRepository.get();
    expect(second?.id).toBe(repository.id);
    expect(second?.id).not.toBe(first?.id);

    const { schedules } = await scheduleService.getSchedules();
    const immichSchedule = schedules.find((entry) => entry.id === second?.scheduleId);
    expect(immichSchedule?.repositories).toEqual([repository.id]);
  });
});
