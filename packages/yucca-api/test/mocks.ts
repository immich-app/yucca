import type { LoggerRepository, WideContextRepository } from '@common/server/otel';
import type { ConnectionRepository } from 'src/repositories/connection.repository';
import type { CryptoRepository } from 'src/repositories/crypto.repository';
import type { DatabaseRepository } from 'src/repositories/database.repository';
import type { DiscordRepository } from 'src/repositories/discord.repository';
import type { OidcRepository } from 'src/repositories/oidc.repository';
import type { RepositoryRepository } from 'src/repositories/repository.repository';
import type { SessionRepository } from 'src/repositories/session.repository';
import type { SettingsRepository } from 'src/repositories/settings.repository';
import type { TopologyRepository } from 'src/repositories/topology.repository';
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

export const newDiscordRepositoryMock = (): jest.Mocked<RepositoryInterface<DiscordRepository>> => {
  return {
    createRequest: jest.fn(),
    getRequestByCode: jest.fn(),
    deleteExpiredRequests: jest.fn(),
    getLinkByDiscordUserId: jest.fn(),
    getLinkByUserId: jest.fn(),
    link: jest.fn(),
    updateUsername: jest.fn(),
    getUserSummary: jest.fn(),
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
    getFeatureOverrides: jest.fn().mockResolvedValue([]),
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

export const newRepositoryRepositoryMock = (): jest.Mocked<RepositoryInterface<RepositoryRepository>> => {
  return {
    create: jest.fn(),
    get: jest.fn(),
    getByUser: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
};

export const newConnectionRepositoryMock = (): jest.Mocked<RepositoryInterface<ConnectionRepository>> => {
  return {
    create: jest.fn(),
    getById: jest.fn(),
    getByUser: jest.fn(),
    getByUserTypeName: jest.fn(),
    getOrCreateDefault: jest.fn(),
    touchLastSeen: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
};

export const newSettingsRepositoryMock = (): jest.Mocked<RepositoryInterface<SettingsRepository>> => {
  return {
    getAll: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };
};

export const newTopologyRepositoryMock = (): jest.Mocked<RepositoryInterface<TopologyRepository>> => {
  return {
    load: jest.fn(),
    get: jest.fn(),
    getSite: jest.fn(),
    hasSite: jest.fn(),
    hasCluster: jest.fn(),
    getActiveCluster: jest.fn(),
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
    connection: newConnectionRepositoryMock(),
    crypto: newCryptoRepositoryMock(),
    database: newDatabaseRepositoryMock(),
    discord: newDiscordRepositoryMock(),
    oidc: newOidcRepositoryMock(),
    session: newSessionRepositoryMock(),
    user: newUserRepositoryMock(),
    userAllowlist: newUserAllowlistRepositoryMock(),
    repository: newRepositoryRepositoryMock(),
    settings: newSettingsRepositoryMock(),
    topology: newTopologyRepositoryMock(),
    logger: newLoggerRepositoryMock(),
    wideContext: newWideContextRepositoryMock(),
    jwt: newJwtServiceMock(),
    metrics: newMetricServiceMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
