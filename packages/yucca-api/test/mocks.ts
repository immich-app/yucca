import type { LoggerRepository, WideContextRepository } from '@common/server/otel';
import type { CryptoRepository } from 'src/repositories/crypto.repository';
import type { DatabaseRepository } from 'src/repositories/database.repository';
import type { OidcRepository } from 'src/repositories/oidc.repository';
import type { SessionRepository } from 'src/repositories/session.repository';
import type { UserRepository } from 'src/repositories/user.repository';
import type { UserAllowlistRepository } from 'src/repositories/userAllowlist.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newCryptoRepositoryMock = (): jest.Mocked<RepositoryInterface<CryptoRepository>> => {
  return {
    randomHex: jest.fn(),
  };
};

export const newDatabaseRepositoryMock = (): jest.Mocked<RepositoryInterface<DatabaseRepository>> => {
  return {
    runMigrations: jest.fn(),
    shutdown: jest.fn(),
  };
};

export const newOidcRepositoryMock = (): jest.Mocked<RepositoryInterface<OidcRepository>> => {
  return {
    authorize: jest.fn(),
    callback: jest.fn(),
    deviceFlow: jest.fn(),
    logout: jest.fn(),
    onModuleInit: jest.fn(),
  };
};

export const newSessionRepositoryMock = (): jest.Mocked<RepositoryInterface<SessionRepository>> => {
  return {
    create: jest.fn(),
    delete: jest.fn(),
  };
};

export const newUserRepositoryMock = (): jest.Mocked<RepositoryInterface<UserRepository>> => {
  return {
    create: jest.fn(),
    getByAccessToken: jest.fn(),
    getBySub: jest.fn(),
    update: jest.fn(),
  };
};

export const newUserAllowlistRepositoryMock = (): jest.Mocked<RepositoryInterface<UserAllowlistRepository>> => {
  return {
    getByEmail: jest.fn(),
    getByInviteCode: jest.fn(),
    markUsed: jest.fn(),
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

export const newJwtServiceMock = () => ({
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
});

export const newMetricServiceMock = () => ({
  getCounter: jest.fn().mockReturnValue({ add: jest.fn() }),
  getGauge: jest.fn().mockReturnValue({ record: jest.fn() }),
});

export const newMocks = () => {
  return {
    crypto: newCryptoRepositoryMock(),
    database: newDatabaseRepositoryMock(),
    oidc: newOidcRepositoryMock(),
    session: newSessionRepositoryMock(),
    user: newUserRepositoryMock(),
    userAllowlist: newUserAllowlistRepositoryMock(),
    logger: newLoggerRepositoryMock(),
    wideContext: newWideContextRepositoryMock(),
    jwt: newJwtServiceMock(),
    metrics: newMetricServiceMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
