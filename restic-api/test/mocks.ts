import type { LoggerRepository } from '@common/server/otel';
import { StorageRepository } from 'src/repositories/storage.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newJwtMock = () => ({
  verifyAsync: jest.fn(),
});

export const newWideContextMock = () => ({
  assignContext: jest.fn(),
});

export const newLoggerRepositoryMock = (): jest.Mocked<RepositoryInterface<LoggerRepository>> => {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
};

export const newStorageRepositoryMock = (): jest.Mocked<RepositoryInterface<StorageRepository>> => {
  return {
    checkBucket: jest.fn(),
    createBucket: jest.fn(),
    deleteObject: jest.fn(),
    getObject: jest.fn(),
    headObject: jest.fn(),
    listObjects: jest.fn(),
    putObject: jest.fn(),
  };
};

export const newMetricServiceMock = () => ({
  getCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
});

export const newMocks = () => {
  return {
    logger: newLoggerRepositoryMock(),
    storage: newStorageRepositoryMock(),
    metricService: newMetricServiceMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
