import { ModuleConfigRepository } from 'src/repositories/moduleConfig.repository';
import { RepositoryIntegrationImmichRepository } from 'src/repositories/repositoryIntegrationImmich.repository';
import { RepositoryPathRepository } from 'src/repositories/repositoryPath.repository';
import { IntegrationsService } from 'src/services/integrations.service';
import { ScheduleService } from 'src/services/schedule.service';
import { createTestingModule, TestContext } from './testUtils';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterAll(async () => {
  await ctx.app.close();
});

describe('Integrations', () => {
  it('rejects configuring Immich when not enabled', async () => {
    const integrationsService = ctx.module.get(IntegrationsService);

    await expect(
      integrationsService.configureImmichIntegration({
        name: 'Immich Backup',
        worm: false,
        cron: '0 2 * * *',
        dataFolders: [],
        backupConfiguration: false,
        libraries: 'all',
      }),
    ).rejects.toThrow('Immich integration is not enabled');
  });

  it('configures Immich integration with new repository and schedule', async () => {
    const moduleConfig = ctx.module.get(ModuleConfigRepository);
    const integrationsService = ctx.module.get(IntegrationsService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);

    moduleConfig.update({
      immichIntegration: {
        dataPath: '/data/immich',
        dataFolders: ['upload', 'library'],
        libraries: [],
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
    expect(integration).toBeDefined();
    expect(integration?.configuration.dataFolders).toEqual(['upload']);

    const config = await integrationsService.getIntegrationsConfig();
    expect(config.immichIntegration).toBeDefined();

    await immichRepository.delete();
    moduleConfig.update({ immichIntegration: undefined });
  });

  it('syncs repository paths from Immich data folders and libraries', async () => {
    const moduleConfig = ctx.module.get(ModuleConfigRepository);
    const integrationsService = ctx.module.get(IntegrationsService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);
    const repositoryPaths = ctx.module.get(RepositoryPathRepository);

    moduleConfig.update({
      immichIntegration: {
        dataPath: '/data/immich',
        dataFolders: ['upload', 'library'],
        libraries: [
          { id: 'lib-1', name: 'Photos', importPaths: ['/mnt/photos'], exclusionPatterns: [] },
          { id: 'lib-2', name: 'Videos', importPaths: ['/mnt/videos'], exclusionPatterns: [] },
        ],
      },
    });

    await integrationsService.configureImmichIntegration({
      name: 'Immich Paths Test',
      worm: false,
      cron: '0 2 * * *',
      dataFolders: ['upload', 'library'],
      backupConfiguration: true,
      libraries: ['lib-1'],
    });

    const integration = await immichRepository.get();
    const paths = await repositoryPaths.get(integration!.id);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/data/immich/upload',
        '/data/immich/library',
        '/mnt/photos',
        moduleConfig.get().statePath,
      ]),
    );
    expect(paths).not.toContain('/mnt/videos');

    await immichRepository.delete();
    moduleConfig.update({ immichIntegration: undefined });
  });

  it('updates existing Immich integration instead of creating new', async () => {
    const moduleConfig = ctx.module.get(ModuleConfigRepository);
    const integrationsService = ctx.module.get(IntegrationsService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);
    const scheduleService = ctx.module.get(ScheduleService);

    moduleConfig.update({
      immichIntegration: {
        dataPath: '/data/immich',
        dataFolders: ['upload'],
        libraries: [],
      },
    });

    await integrationsService.configureImmichIntegration({
      name: 'Original Name',
      worm: false,
      cron: '0 2 * * *',
      dataFolders: ['upload'],
      backupConfiguration: false,
      libraries: 'all',
    });

    const firstIntegration = await immichRepository.get();

    await integrationsService.configureImmichIntegration({
      name: 'Updated Name',
      worm: false,
      cron: '0 4 * * *',
      dataFolders: ['upload'],
      backupConfiguration: false,
      libraries: 'all',
    });

    const secondIntegration = await immichRepository.get();

    expect(secondIntegration?.id).toBe(firstIntegration?.id);
    expect(secondIntegration?.scheduleId).toBe(firstIntegration?.scheduleId);

    const { schedules } = await scheduleService.getSchedules();
    const immichSchedule = schedules.find((entry) => entry.id === secondIntegration?.scheduleId);
    expect(immichSchedule?.cron).toBe('0 4 * * *');

    await immichRepository.delete();
    moduleConfig.update({ immichIntegration: undefined });
  });

  it('pauses and resumes the managed schedule', async () => {
    const moduleConfig = ctx.module.get(ModuleConfigRepository);
    const integrationsService = ctx.module.get(IntegrationsService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);
    const scheduleService = ctx.module.get(ScheduleService);

    moduleConfig.update({
      immichIntegration: {
        dataPath: '/data/immich',
        dataFolders: ['upload'],
        libraries: [],
      },
    });

    const configuration = {
      name: 'Immich Backup',
      worm: false,
      cron: '0 2 * * *',
      dataFolders: ['upload'],
      backupConfiguration: false,
      libraries: 'all' as const,
    };

    await integrationsService.configureImmichIntegration(configuration);

    const getSchedule = async () => {
      const integration = await immichRepository.get();
      const { schedules } = await scheduleService.getSchedules();

      return schedules.find((entry) => entry.id === integration?.scheduleId);
    };

    expect((await getSchedule())?.paused).toBe(false);

    await integrationsService.configureImmichIntegration({ ...configuration, paused: true });

    expect((await getSchedule())?.paused).toBe(true);

    await integrationsService.configureImmichIntegration({ ...configuration, paused: false });

    expect((await getSchedule())?.paused).toBe(false);

    await immichRepository.delete();
    moduleConfig.update({ immichIntegration: undefined });
  });
});
