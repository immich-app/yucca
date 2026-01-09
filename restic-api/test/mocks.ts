import { LoggerRepository } from 'src/repositories/logger.repository';
import { StorageRepository } from 'src/repositories/storage.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newJwtMock = () => ({
  verifyAsync: jest.fn(),
});

export const newLoggerRepositoryMock = (): jest.Mocked<RepositoryInterface<LoggerRepository>> => {
  return {
    setContext: jest.fn(),
    debug: jest.fn(),
  };
};

export const newStorageRepositoryMock = (): jest.Mocked<RepositoryInterface<StorageRepository>> => {
  return {
    checkBucket: jest.fn(),
    createBucket: jest.fn(),
    deleteObject: jest.fn(),
    getObjectStream: jest.fn(),
    headObject: jest.fn(),
    listObjects: jest.fn(),
    putObject: jest.fn(),
  };
};

export const newMocks = () => {
  return {
    logger: newLoggerRepositoryMock(),
    storage: newStorageRepositoryMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
