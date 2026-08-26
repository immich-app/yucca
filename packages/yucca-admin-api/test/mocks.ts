import type { EmailRepository } from '@common/server/email';
import type { LoggerRepository, WideContextRepository } from '@common/server/otel';
import type { DatabaseRepository } from 'src/repositories/database.repository';
import type { DiscordInviteRepository } from 'src/repositories/discordInvite.repository';
import type { DiscordLinkRepository } from 'src/repositories/discordLink.repository';
import type { FutoBackupsBotRepository } from 'src/repositories/futoBackupsBot.repository';
import type { OidcRepository } from 'src/repositories/oidc.repository';
import type { SessionRepository } from 'src/repositories/session.repository';
import type { UserRepository } from 'src/repositories/user.repository';
import type { UserAllowlistRepository } from 'src/repositories/userAllowlist.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newDiscordInviteRepositoryMock = (): jest.Mocked<RepositoryInterface<DiscordInviteRepository>> => {
  return {
    listClaims: jest.fn().mockResolvedValue([]),
    getClaim: jest.fn(),
    deleteClaim: jest.fn().mockResolvedValue('deleted'),
    listBatches: jest.fn().mockResolvedValue([]),
    getBatch: jest.fn(),
    cancelBatch: jest.fn().mockResolvedValue(0),
  };
};

export const newFutoBackupsBotRepositoryMock = (): jest.Mocked<RepositoryInterface<FutoBackupsBotRepository>> => {
  return {
    enabled: true,
    closeDrop: jest.fn().mockResolvedValue(void 0),
  };
};

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

export const newDiscordLinkRepositoryMock = (): jest.Mocked<RepositoryInterface<DiscordLinkRepository>> => {
  return {
    getByUserId: jest.fn(),
    link: jest.fn(),
    unlink: jest.fn(),
  };
};

export const newUserRepositoryMock = (): jest.Mocked<RepositoryInterface<UserRepository>> => {
  return {
    list: jest.fn(),
    get: jest.fn(),
    getBySub: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    hasRepositories: jest.fn(),
  };
};

export const newSessionRepositoryMock = (): jest.Mocked<RepositoryInterface<SessionRepository>> => {
  return {
    delete: jest.fn(),
    deleteByUser: jest.fn(),
    getByUser: jest.fn(),
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
    discordInvite: newDiscordInviteRepositoryMock(),
    bot: newFutoBackupsBotRepositoryMock(),
    database: newDatabaseRepositoryMock(),
    discordLink: newDiscordLinkRepositoryMock(),
    user: newUserRepositoryMock(),
    session: newSessionRepositoryMock(),
    oidc: newOidcRepositoryMock(),
    email: newEmailRepositoryMock(),
    allowlist: newUserAllowlistRepositoryMock(),
    logger: newLoggerRepositoryMock(),
    wideContext: newWideContextRepositoryMock(),
    metrics: newMetricServiceMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
