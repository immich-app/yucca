import type { ImmichBackupStatusDto } from '$lib/fetch-client';
import { toImmichBackupStatus } from '$lib/services/immich.integration.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib', () => ({ sdk: {} }));

const backedUp = {
  repository: {
    metrics: {
      lastBackup: '2026-09-30T12:00:00.000Z',
      lastBackupStatus: 'complete',
    },
  },
  schedule: { paused: false },
} as unknown as ImmichBackupStatusDto;

const paused = (status: ImmichBackupStatusDto) =>
  ({
    ...status,
    schedule: { ...status.schedule, paused: true },
  }) as ImmichBackupStatusDto;

describe('toImmichBackupStatus', () => {
  it('reports the last backup outcome while the schedule runs', () => {
    expect(toImmichBackupStatus(backedUp, false)).toEqual({
      kind: 'complete',
      lastBackup: '2026-09-30T12:00:00.000Z',
    });
  });

  it('reports a paused schedule even after a backup has run', () => {
    expect(toImmichBackupStatus(paused(backedUp), false)).toEqual({
      kind: 'paused',
    });
  });

  it.each(['failed', 'warn'] as const)(
    'reports a %s last backup over a paused schedule',
    (lastBackupStatus) => {
      const status = paused({
        ...backedUp,
        repository: {
          metrics: { ...backedUp.repository!.metrics, lastBackupStatus },
        },
      } as ImmichBackupStatusDto);

      expect(toImmichBackupStatus(status, false)).toEqual({
        kind: lastBackupStatus,
        lastBackup: '2026-09-30T12:00:00.000Z',
      });
    },
  );

  it('reports a running backup over a paused schedule', () => {
    const running = {
      ...paused(backedUp),
      latestBackupRun: { status: 'incomplete' },
    } as ImmichBackupStatusDto;

    expect(toImmichBackupStatus(running, false)).toEqual({ kind: 'running' });
  });
});
