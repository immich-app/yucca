import type { LoggerRepository } from '@common/server/otel';
import type { ColumboRepository } from 'src/repositories/columbo.repository';
import type { DiscordRepository } from 'src/repositories/discord.repository';
import type { FreshdeskRepository } from 'src/repositories/freshdesk.repository';
import type { TranscriptStorageRepository } from 'src/repositories/transcriptStorage.repository';
import type { YuccaApiRepository } from 'src/repositories/yuccaApi.repository';
import type { FreshdeskSyncService } from 'src/services/freshdeskSync.service';

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
    createStaffThread: jest.fn().mockResolvedValue({ thread: { id: 'staff-thread-1' }, seed: { id: 'staff-seed-1' } }),
    getThreadById: jest.fn(),
    sendToThread: jest.fn().mockResolvedValue(void 0),
    fetchMessagesAfter: jest.fn().mockResolvedValue([]),
    listOpenTicketThreads: jest.fn().mockResolvedValue([]),
    findSupportThreadByName: jest.fn(),
    closeThread: jest.fn(),
    listClosedTicketThreads: jest.fn().mockResolvedValue([]),
    fetchAllMessages: jest.fn(),
    deleteThread: jest.fn(),
  };
};

export const newFreshdeskRepositoryMock = (): jest.Mocked<RepositoryInterface<FreshdeskRepository>> => {
  return {
    enabled: true,
    createTicket: jest.fn().mockResolvedValue('42'),
    getTicketStatus: jest.fn().mockResolvedValue(2),
    resolveTicket: jest.fn().mockResolvedValue(void 0),
    setRequester: jest.fn().mockResolvedValue(void 0),
    createNote: jest.fn().mockResolvedValue(void 0),
    createReply: jest.fn().mockResolvedValue(void 0),
    listConversationsAfter: jest.fn().mockResolvedValue([]),
    listUpdatedTicketIds: jest.fn().mockResolvedValue([]),
    getOwnAgentId: jest.fn().mockResolvedValue(1),
    getAgentName: jest.fn().mockResolvedValue('Agent Smith'),
  };
};

export const newFreshdeskSyncServiceMock = (): jest.Mocked<RepositoryInterface<FreshdeskSyncService>> => {
  return {
    enabled: false,
    onTicketOpened: jest.fn().mockResolvedValue(void 0),
    onTicketClosed: jest.fn().mockResolvedValue(void 0),
    onFreshdeskPing: jest.fn().mockResolvedValue(void 0),
    onEmailUpdatesCommand: jest.fn().mockResolvedValue(void 0),
    onHandoffCommand: jest.fn().mockResolvedValue(void 0),
    handleMessage: jest.fn().mockResolvedValue(void 0),
    poll: jest.fn().mockResolvedValue(void 0),
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
    createTicketMapping: jest.fn(),
    getTicketByThread: jest.fn().mockResolvedValue(null),
    getTicketByFreshdeskId: jest.fn().mockResolvedValue(null),
    listOpenTickets: jest.fn().mockResolvedValue([]),
    updateTicket: jest.fn().mockResolvedValue(void 0),
  };
};

export const newColumboRepositoryMock = (): jest.Mocked<RepositoryInterface<ColumboRepository>> => {
  return {
    enabled: true,
    requestInvestigation: jest.fn().mockResolvedValue(void 0),
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
    freshdesk: newFreshdeskRepositoryMock(),
    freshdeskSync: newFreshdeskSyncServiceMock(),
    columbo: newColumboRepositoryMock(),
  };
};

export type Mocks = ReturnType<typeof newMocks>;
