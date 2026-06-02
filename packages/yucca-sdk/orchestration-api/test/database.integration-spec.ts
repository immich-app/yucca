import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { RepositoryService } from 'src/services/repository.service';
import { ScheduleService } from 'src/services/schedule.service';
import { createTestingModule, TestContext } from './testUtils';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterAll(async () => {
  await ctx.app.close();
});

describe('Database', () => {
  it('restores tables from another database', async () => {
    const repositoryService = ctx.module.get(RepositoryService);
    const scheduleService = ctx.module.get(ScheduleService);
    const databaseRepository = ctx.module.get(DatabaseRepository);
    const configRepository = ctx.module.get(ConfigRepository);

    const { repository } = await repositoryService.createRepository(
      { name: 'Snapshot Repo', worm: false },
      ctx.backendId,
    );

    const { schedule } = await scheduleService.createSchedule({
      name: 'Snapshot Schedule',
      cron: '0 0 * * *',
      repositories: [repository.id],
    });

    const keyBeforeRestore = await configRepository.getMasterEncryptionKey();

    const restoreDir = await mkdtemp(join(tmpdir(), 'yucca-restore-'));
    const snapshotPath = join(restoreDir, 'state.sqlite3');
    await ctx.database.backup(snapshotPath);

    await scheduleService.createSchedule({
      name: 'Post-Snapshot Schedule',
      cron: '0 6 * * *',
      repositories: [],
    });
    await configRepository.importEncryptionKey('modified-key-after-snapshot');

    const { schedules: beforeRestore } = await scheduleService.getSchedules();
    expect(beforeRestore.find((entry) => entry.name === 'Post-Snapshot Schedule')).toBeDefined();
    expect(await configRepository.getMasterEncryptionKey()).toBe('modified-key-after-snapshot');

    await databaseRepository.restoreFrom(snapshotPath);

    const { schedules: afterRestore } = await scheduleService.getSchedules();
    expect(afterRestore.find((entry) => entry.name === 'Post-Snapshot Schedule')).toBeUndefined();
    expect(afterRestore.find((entry) => entry.id === schedule.id)).toBeDefined();
    expect(await configRepository.getMasterEncryptionKey()).toBe(keyBeforeRestore);
  });
});
