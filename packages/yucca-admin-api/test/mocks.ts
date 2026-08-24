import type { EmailRepository } from '@common/server/email';
import type { LoggerRepository, WideContextRepository } from '@common/server/otel';
import type { DatabaseRepository } from 'src/repositories/database.repository';
import type { OidcRepository } from 'src/repositories/oidc.repository';
import type { UserAllowlistRepository } from 'src/repositories/userAllowlist.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newDatabaseRepositoryMock = (): jest.Mocked<RepositoryInterface<DatabaseRepository>> => {
  return {
    shutdown: jest.fn(),
  };
};

export const newOidcRepositoryMock = (): jest.Mocked<RepositoryInterface<OidcRepository>> => {
  return {
    authorize: jest.fn(),
    callback: jest.fn(),
    logout: jest.fn(),
    onModuleInit: jest.fn(),
    fetchUserInfo: jest.fn(),
  };
};

export const newEmailRepositoryMock = (): jest.Mocked<RepositoryInterface<EmailRepository>> => {
  return {
    send: jest.fn(),
    sendBatch: jest.fn(),
  };
};

export const newUserAllowlistRepositoryMock = (): jest.Mocked<RepositoryInterface<UserAllowlistRepository>> => {
  return {
    list: jest.fn(),
    getByEmail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteByEmail: jest.fn(),
    oldestStaged: jest.fn(),
  };
};

export const newLoggerRepositoryMock = (): jest.Mocked<RepositoryInterface<LoggerRepository>> => {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
};

export const newWideContextRepositoryMock = (): jest.Mocked<RepositoryInterface<WideContextRepository>> => ({
  context: {},
  addContext: jest.fn(),
  applyContext: jest.fn(),
  assignContext: jest.fn(),
  setErrorCause: jest.fn(),
});

export const newMetricServiceMock = () => ({
  getCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
});

export const newMocks = () => {
  return {
    database: newDatabaseRepositoryMock(),
    oidc: newOidcRepositoryMock(),
    email: newEmailRepositoryMock(),
    allowlist: newUserAllowlistRepositoryMock(),
    logger: newLoggerRepositoryMock(),
    wideContext: newWideContextRepositoryMock(),
    metrics: newMetricServiceMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
