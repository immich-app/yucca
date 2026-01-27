import { LoggerRepository } from '@common/server/otel';
import { DummyRepository } from 'src/repositories/dummy.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newJwtMock = () => ({
  verifyAsync: jest.fn(),
});

export const newLoggerRepositoryMock = (): jest.Mocked<RepositoryInterface<LoggerRepository>> => {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
};

export const newDummyRepositoryMock = (): jest.Mocked<RepositoryInterface<DummyRepository>> => {
  return {
    get: jest.fn(),
  };
};

export const newMetricServiceMock = () => ({
  getCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
});

export const newMocks = () => {
  return {
    logger: newLoggerRepositoryMock(),
    dummy: newDummyRepositoryMock(),
    metrics: newMetricServiceMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
