import type { ImmichIntegration } from 'src/moduleConfig';
import type { ResticRepository } from 'src/repositories/restic.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newResticRepositoryMock = (): jest.Mocked<RepositoryInterface<ResticRepository>> => {
  return {
    init: jest.fn(),
    backup: jest.fn(),
    restore: jest.fn(),
    snapshots: jest.fn().mockResolvedValue([]),
    snapshot: jest.fn(),
    stats: jest.fn().mockResolvedValue({ total_size: 0, snapshots_count: 0 }),
    forget: jest.fn(),
    forgetByPolicy: jest.fn().mockResolvedValue([]),
    prune: jest.fn(),
    ls: jest.fn().mockResolvedValue([]),
    keyList: jest.fn().mockResolvedValue([{ id: 'key-1', current: true }]),
    unlockAll: jest.fn(),
  };
};

export const newImmichHooksMock = (): jest.Mocked<ImmichIntegration['hooks']> => ({
  createDatabaseBackup: jest.fn().mockResolvedValue('dump.sql.gz'),
  cleanupDatabaseBackups: jest.fn(),
  getImmichDatabaseDumpConfig: jest.fn().mockResolvedValue({ enabled: true, keepLastAmount: 14 }),
  configureImmichDatabaseDump: jest.fn(),
  enterMaintenanceRollback: jest.fn().mockResolvedValue({ jwt: 'jwt' }),
});
