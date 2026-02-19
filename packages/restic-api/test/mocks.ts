import type { LoggerRepository, MetricService, WideContextRepository } from '@common/server/otel';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
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
    getObject: jest.fn().mockResolvedValue({
      ContentLength: 1000,
      Body: {
        transformToWebStream() {
          return Readable.toWeb(Readable.from('_'.repeat(1000)));
        },
      },
    }),
    headObject: jest.fn(),
    listObjects: jest.fn(),
    putObject: jest.fn().mockImplementation((_1, _2, body: Readable) => text(body)),
  };
};

export const newWideContextRepositoryMock = (): jest.Mocked<RepositoryInterface<WideContextRepository>> => ({
  context: {},
  addContext: jest.fn(),
  applyContext: jest.fn(),
  assignContext: jest.fn(),
  setErrorCause: jest.fn(),
});

export const newMetricServiceMock = (): jest.Mocked<RepositoryInterface<MetricService>> => ({
  getCounter: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
  getGauge: jest.fn(),
  getHistogram: jest.fn(),
  getObservableCounter: jest.fn(),
  getObservableGauge: jest.fn(),
  getObservableUpDownCounter: jest.fn(),
  getUpDownCounter: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
});

export const newMocks = () => {
  return {
    logger: newLoggerRepositoryMock(),
    storage: newStorageRepositoryMock(),
    metricService: newMetricServiceMock(),
    wideContext: newWideContextRepositoryMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
