import type { ResticRepository } from 'src/repositories/restic.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newResticRepositoryMock = (): jest.Mocked<RepositoryInterface<ResticRepository>> => {
  return {
    init: jest.fn(),
    backup: jest.fn(),
    restore: jest.fn(),
    snapshots: jest.fn().mockResolvedValue([]),
    stats: jest.fn().mockResolvedValue({ total_size: 0, snapshots_count: 0 }),
    forget: jest.fn(),
    ls: jest.fn().mockResolvedValue([]),
    keyList: jest.fn().mockResolvedValue([{ id: 'key-1', current: true }]),
  };
};
