import { SchedulerRegistry } from '@nestjs/schedule';
import { ModuleConfigRepository } from 'src/repositories/moduleConfig.repository';
import { RepositoryIntegrationImmichRepository } from 'src/repositories/repositoryIntegrationImmich.repository';
import { RepositoryService } from 'src/services/repository.service';
import { ScheduleService } from 'src/services/schedule.service';
import { createTestingModule, TestContext, waitForEvent } from './testUtils';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterAll(async () => {
  await ctx.app.close();
});

describe('Schedule', () => {
  it('does not execute backups when lock is required but not acquired', async () => {
    const moduleConfig = ctx.module.get(ModuleConfigRepository);
    const repositoryService = ctx.module.get(RepositoryService);
    const scheduleService = ctx.module.get(ScheduleService);

    moduleConfig.update({ requireLock: true });

    const { repository } = await repositoryService.createRepository(
      { name: 'Locked Repo', worm: false, paths: ['/tmp/test'] },
      ctx.backendId,
    );

    const { schedule } = await scheduleService.createSchedule({
      name: 'Locked Schedule',
      cron: '0 0 1 1 *',
      repositories: [repository.id],
    });

    ctx.resticMock.backup.mockReset();
    void ctx.module.get(SchedulerRegistry).getCronJob(schedule.id).fireOnTick();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(ctx.resticMock.backup).not.toHaveBeenCalled();

    moduleConfig.update({ requireLock: false });
  });

  it('skips task creation when schedule has no repositories', async () => {
    const { schedule } = await ctx.module.get(ScheduleService).createSchedule({
      name: 'Empty Schedule',
      cron: '0 0 1 1 *',
      repositories: [],
    });

    const scheduleUpdate = waitForEvent(ctx.gateway, 'ScheduleUpdate');

    ctx.resticMock.backup.mockReset();
    void ctx.module.get(SchedulerRegistry).getCronJob(schedule.id).fireOnTick();

    await expect(scheduleUpdate).resolves.toEqual(
      expect.objectContaining({
        type: 'ScheduleUpdate',
        scheduleId: schedule.id,
        schedule: expect.objectContaining({ lastRun: expect.any(String) }),
      }),
    );

    expect(ctx.resticMock.backup).not.toHaveBeenCalled();
  });

  it('runs backups for each repository in the schedule', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const scheduleService = ctx.module.get(ScheduleService);

    const { repository: repo1 } = await repositoryService.createRepository(
      { name: 'Scheduled Repo 1', worm: false, paths: ['/tmp/test1'] },
      ctx.backendId,
    );

    const { repository: repo2 } = await repositoryService.createRepository(
      { name: 'Scheduled Repo 2', worm: false, paths: ['/tmp/test2'] },
      ctx.backendId,
    );

    const { schedule } = await scheduleService.createSchedule({
      name: 'Multi Schedule',
      cron: '0 0 1 1 *',
      repositories: [repo1.id, repo2.id],
    });

    const lastRunEvent = waitForEvent(ctx.gateway, 'ScheduleUpdate');

    ctx.resticMock.backup.mockReset();
    void ctx.module.get(SchedulerRegistry).getCronJob(schedule.id).fireOnTick();

    await expect(lastRunEvent).resolves.toEqual(
      expect.objectContaining({
        scheduleId: schedule.id,
        schedule: expect.objectContaining({ lastRun: expect.any(String) }),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(ctx.resticMock.backup).toHaveBeenCalled();
  });

  it('continues to next repository when a backup fails', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const scheduleService = ctx.module.get(ScheduleService);

    const { repository: failRepo } = await repositoryService.createRepository(
      { name: 'Fail Repo', worm: false, paths: ['/tmp/fail'] },
      ctx.backendId,
    );

    const { repository: successRepo } = await repositoryService.createRepository(
      { name: 'Success Repo', worm: false, paths: ['/tmp/success'] },
      ctx.backendId,
    );

    ctx.resticMock.backup.mockReset();
    let callCount = 0;
    ctx.resticMock.backup.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Simulated backup failure'));
      }
      return Promise.resolve();
    });

    const { schedule } = await scheduleService.createSchedule({
      name: 'Resilient Schedule',
      cron: '0 0 1 1 *',
      repositories: [failRepo.id, successRepo.id],
    });

    void ctx.module.get(SchedulerRegistry).getCronJob(schedule.id).fireOnTick();

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(callCount).toBe(2);
    expect(ctx.resticMock.backup).toHaveBeenCalledTimes(2);

    ctx.resticMock.backup.mockReset();
  });

  it('links new repositories and applies the given ordering on update', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const scheduleService = ctx.module.get(ScheduleService);

    const { repository: existing } = await repositoryService.createRepository(
      { name: 'Existing Repo', worm: false },
      ctx.backendId,
    );

    const { repository: added } = await repositoryService.createRepository(
      { name: 'Added Repo', worm: false },
      ctx.backendId,
    );

    const { schedule } = await scheduleService.createSchedule({
      name: 'Ordering Schedule',
      cron: '0 0 1 1 *',
      repositories: [existing.id],
    });

    const { schedule: updated } = await scheduleService.updateSchedule(schedule.id, {
      repositories: [added.id, existing.id],
    });

    expect(updated.repositories).toEqual([added.id, existing.id]);
  });

  it('rejects deletion when schedule is managed by Immich integration', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const scheduleService = ctx.module.get(ScheduleService);
    const immichRepository = ctx.module.get(RepositoryIntegrationImmichRepository);

    const { repository } = await repositoryService.createRepository(
      { name: 'Immich Repo', worm: false },
      ctx.backendId,
    );

    const { schedule } = await scheduleService.createSchedule({
      name: 'Immich Schedule',
      cron: '0 2 * * *',
      repositories: [repository.id],
    });

    await immichRepository.upsert(repository.id, schedule.id, {
      dataFolders: [],
      backupConfiguration: false,
      libraries: 'all',
    });

    await expect(scheduleService.removeSchedule(schedule.id)).rejects.toThrow('Schedule managed by Immich integration');

    await immichRepository.delete();
  });
});
