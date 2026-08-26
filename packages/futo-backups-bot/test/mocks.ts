import type { LoggerRepository } from '@common/server/otel';
import type { DiscordRepository } from 'src/repositories/discord.repository';
import type { TranscriptStorageRepository } from 'src/repositories/transcriptStorage.repository';
import type { YuccaApiRepository } from 'src/repositories/yuccaApi.repository';

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export const newLoggerRepositoryMock = (): jest.Mocked<RepositoryInterface<LoggerRepository>> => {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
};

export const newDiscordRepositoryMock = (): jest.Mocked<RepositoryInterface<DiscordRepository>> => {
  return {
    enabled: true,
    start: jest.fn(),
    registerCommands: jest.fn(),
    ensurePinnedMessage: jest.fn(),
    addRoleToMember: jest.fn(),
    listRecentMessages: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn(),
    sendDirectMessage: jest.fn().mockResolvedValue(true),
    editMessage: jest.fn().mockResolvedValue(void 0),
    createTicketThread: jest.fn(),
    createStaffThread: jest.fn(),
    listOpenTicketThreads: jest.fn().mockResolvedValue([]),
    findSupportThreadByName: jest.fn(),
    closeThread: jest.fn(),
    listClosedTicketThreads: jest.fn().mockResolvedValue([]),
    fetchAllMessages: jest.fn(),
    deleteThread: jest.fn(),
  };
};

export const newYuccaApiRepositoryMock = (): jest.Mocked<RepositoryInterface<YuccaApiRepository>> => {
  return {
    createLinkRequest: jest.fn(),
    getLink: jest.fn(),
    updateLinkUsername: jest.fn().mockResolvedValue(void 0),
    createInviteBatch: jest.fn(),
    setInviteBatchMessage: jest.fn().mockResolvedValue(void 0),
    createInvite: jest.fn(),
    getUserSummary: jest.fn(),
  };
};

export const newTranscriptStorageRepositoryMock = (): jest.Mocked<RepositoryInterface<TranscriptStorageRepository>> => {
  return {
    enabled: true,
    put: jest.fn(),
  };
};

export const newMocks = () => {
  return {
    logger: newLoggerRepositoryMock(),
    discord: newDiscordRepositoryMock(),
    api: newYuccaApiRepositoryMock(),
    storage: newTranscriptStorageRepositoryMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
