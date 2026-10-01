import { SocketEvent } from '$lib/events';
import type { RunDto, RunStatus, RunType } from '$lib/fetch-client';
import { useBackupTaskMonitor } from '$lib/services/runHistory.service';
import { toastManager } from '@immich/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib', () => ({ sdk: {} }));

vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { show: vi.fn() },
}));

const createRun = (id: string, type: RunType) =>
  new SocketEvent('RunCreate', { run: { id, type } as RunDto });

const updateRun = (runId: string, status: RunStatus) =>
  new SocketEvent('RunUpdate', { runId, run: { status } });

describe('useBackupTaskMonitor', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['complete', 'success', 'Backup complete'],
    ['warn', 'warning', 'Backup completed with warnings'],
    ['failed', 'danger', 'Backup failed'],
    ['cancelled', 'secondary', 'Backup cancelled'],
  ] as const)('shows a %s backup as a %s alert', (status, color, title) => {
    const monitor = useBackupTaskMonitor();

    monitor.onRunCreate(createRun('run-1', 'backup'));
    monitor.onRunUpdate(updateRun('run-1', status));

    expect(toastManager.show).toHaveBeenCalledWith(
      expect.objectContaining({ color, title }),
      { closable: true },
    );
  });

  it('alerts once per run, after it stops running', () => {
    const monitor = useBackupTaskMonitor();

    monitor.onRunCreate(createRun('run-1', 'schedule'));
    monitor.onRunUpdate(updateRun('run-1', 'incomplete'));
    expect(toastManager.show).not.toHaveBeenCalled();

    monitor.onRunUpdate(updateRun('run-1', 'complete'));
    monitor.onRunUpdate(updateRun('run-1', 'complete'));
    expect(toastManager.show).toHaveBeenCalledTimes(1);
  });

  it('ignores restores, prunes and runs it did not see start', () => {
    const monitor = useBackupTaskMonitor();

    monitor.onRunCreate(createRun('run-1', 'restore'));
    monitor.onRunCreate(createRun('run-2', 'forget'));
    monitor.onRunUpdate(updateRun('run-1', 'complete'));
    monitor.onRunUpdate(updateRun('run-2', 'complete'));
    monitor.onRunUpdate(updateRun('run-3', 'complete'));

    expect(toastManager.show).not.toHaveBeenCalled();
  });
});
