import { submitMetricBackupEnd, submitStructuredLog } from '@futo-org/backups-api-client';
import { randomUUID } from 'node:crypto';
import { REPOSITORY_DEFAULT_CLOUD_UUID } from 'src/const';
import { BackendType, BootstrapStatus, TaskStatus, TaskType } from 'src/enum';
import { BackendRepository } from 'src/repositories/backend.repository';
import { BootstrapRepository } from 'src/repositories/bootstrap.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { RunHistoryRepository } from 'src/repositories/runHistory.repository';
import { BootstrapService } from 'src/services/bootstrap.service';
import { createTestingModule, TestContext, waitFor } from './testUtils';

const apiSubmitMetricBackupEnd = submitMetricBackupEnd as jest.Mock;
const apiSubmitStructuredLog = submitStructuredLog as jest.Mock;

let ctx: TestContext;

const createInterruptedRun = async (type = TaskType.Backup) => {
  const repositoryId = randomUUID();
  const remoteId = `remote-${repositoryId}`;

  await ctx.module.get(RepositoryRepository).create({
    id: repositoryId,
    remoteId,
    backendId: REPOSITORY_DEFAULT_CLOUD_UUID,
    retentionPolicy: null,
    siteCode: null,
    storageClusterCode: null,
  });

  const { logWriter } = await ctx.module.get(RunHistoryRepository).createLogHelper({ repositoryId, type });
  logWriter.close();

  return { repositoryId, remoteId };
};

const getRun = (repositoryId: string) => ctx.module.get(RunHistoryRepository).getAll(repositoryId);

beforeAll(async () => {
  ctx = await createTestingModule();
}, 15_000);

afterAll(async () => {
  await ctx.app.close();
});

beforeEach(async () => {
  jest.clearAllMocks();
  ctx.database.prepare('DELETE FROM runHistory').run();
  ctx.database.prepare('DELETE FROM repositories').run();

  await ctx.module.get(BackendRepository).updateBackend(REPOSITORY_DEFAULT_CLOUD_UUID, {
    type: BackendType.Yucca,
    url: 'http://yucca.test',
    accessToken: 'test-token',
  });
  await ctx.module.get(ConfigRepository).enableTelemetry();
});

describe('Bootstrap', () => {
  it('reports interrupted backup runs to the backend', async () => {
    const { repositoryId, remoteId } = await createInterruptedRun();

    await ctx.module.get(BootstrapService).onApplicationBootstrap();

    expect(ctx.module.get(BootstrapRepository).getStatus()).toBe(BootstrapStatus.Ready);

    await waitFor(() => apiSubmitMetricBackupEnd.mock.calls.length > 0);
    expect(apiSubmitMetricBackupEnd).toHaveBeenCalledWith(
      remoteId,
      { success: false, durationMs: expect.any(Number) },
      expect.any(Object),
    );

    await waitFor(() => apiSubmitStructuredLog.mock.calls.some(([{ summary }]) => summary === 'Backup finished'));
    expect(apiSubmitStructuredLog).toHaveBeenCalledWith(
      {
        summary: 'Backup finished',
        data: expect.objectContaining({ repositoryId, lastBackupStatus: TaskStatus.Failed }),
      },
      expect.any(Object),
    );

    const [run] = await getRun(repositoryId);
    expect(run.status).toBe(TaskStatus.Failed);
    expect(run.end).toEqual(expect.any(String));
  });

  it('does not submit a backup end metric for interrupted restore runs', async () => {
    const { repositoryId } = await createInterruptedRun(TaskType.Restore);

    await ctx.module.get(BootstrapService).onApplicationBootstrap();

    const [run] = await getRun(repositoryId);
    expect(run.status).toBe(TaskStatus.Failed);
    expect(apiSubmitMetricBackupEnd).not.toHaveBeenCalled();
  });

  it('leaves completed runs untouched', async () => {
    const { repositoryId } = await createInterruptedRun();
    const [{ id: runId }] = await getRun(repositoryId);
    ctx.database.prepare('UPDATE runHistory SET status = ? WHERE id = ?').run(TaskStatus.Complete, runId);

    await ctx.module.get(BootstrapService).onApplicationBootstrap();

    const [run] = await getRun(repositoryId);
    expect(run.status).toBe(TaskStatus.Complete);
    expect(apiSubmitMetricBackupEnd).not.toHaveBeenCalled();
  });
});
