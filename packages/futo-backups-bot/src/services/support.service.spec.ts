import { ThreadChannel } from 'discord.js';
import { ComponentId } from 'src/enum';
import { SupportService } from 'src/services/support.service';
import { Mocks, newMocks } from '../../test/mocks';

const link = { userId: 'user-1', discordUserId: '123456789', discordUsername: 'someone' };

const summary = {
  id: 'user-1',
  name: 'Someone',
  email: 'someone@example.test',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  connectionCount: 1,
  repositoryCount: 2,
  lastSeenAt: null,
};

const newButtonInteraction = (customId: string, overrides: object = {}) =>
  ({
    isButton: () => true,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    customId,
    user: { id: '123456789', username: 'Someone' },
    replied: false,
    deferred: false,
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
    showModal: jest.fn(),
    member: { roles: [] as string[] },
    channel: null,
    ...overrides,
  }) as never;

const newCommandInteraction = (targetUser: object, overrides: object = {}) =>
  ({
    isButton: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => true,
    commandName: 'ticket',
    user: { id: 'staff-1', username: 'Staffer' },
    options: { getUser: jest.fn().mockReturnValue(targetUser) },
    replied: false,
    deferred: false,
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
    member: { roles: [] as string[] },
    ...overrides,
  }) as never;

const newModalInteraction = (description: string, overrides: object = {}) =>
  ({
    isButton: () => false,
    isModalSubmit: () => true,
    isChatInputCommand: () => false,
    customId: ComponentId.TicketModal,
    user: { id: '123456789', username: 'Someone' },
    replied: false,
    deferred: false,
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
    fields: { getTextInputValue: jest.fn().mockReturnValue(description) },
    ...overrides,
  }) as never;

const asThread = (properties: object): ThreadChannel =>
  Object.assign(Object.create(ThreadChannel.prototype) as ThreadChannel, properties);

describe(SupportService.name, () => {
  let sut: SupportService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new SupportService(mocks.logger as never, mocks.discord as never, mocks.api as never);
  });

  describe('open ticket button', () => {
    it('starts the link flow for an unlinked user', async () => {
      mocks.api.getLink.mockResolvedValue(null);
      mocks.api.createLinkRequest.mockResolvedValue({ code: 'code-1', expiresAt: new Date(Date.now() - 1) });
      const interaction = newButtonInteraction(ComponentId.OpenTicket);

      await sut.handleInteraction(interaction);

      expect(mocks.api.createLinkRequest).toHaveBeenCalledWith('123456789', 'Someone');
      expect((interaction as { deferReply: jest.Mock }).deferReply).toHaveBeenCalled();
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('expired') }),
      );
    });

    it('fails soft when the link lookup is unavailable', async () => {
      mocks.api.getLink.mockRejectedValue(new Error('yucca-api down'));
      const interaction = newButtonInteraction(ComponentId.OpenTicket);

      await sut.handleInteraction(interaction);

      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('temporarily unavailable') }),
      );
      expect((interaction as { showModal: jest.Mock }).showModal).not.toHaveBeenCalled();
    });

    it('shows the description modal for a linked user', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      const interaction = newButtonInteraction(ComponentId.OpenTicket);

      await sut.handleInteraction(interaction);

      expect((interaction as { showModal: jest.Mock }).showModal).toHaveBeenCalled();
    });
  });

  describe('ticket modal', () => {
    it('points a user with an open ticket at it instead of creating another', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      mocks.discord.findOpenTicketThread.mockResolvedValue(asThread({ id: 'thread-1', name: 'ticket-someone-6789' }));
      const interaction = newModalInteraction('My backups are failing.');

      await sut.handleInteraction(interaction);

      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('thread-1') }),
      );
      expect(mocks.discord.createTicketThread).not.toHaveBeenCalled();
    });

    it('creates the ticket thread with a staff thread and replies with a pointer', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      mocks.api.getUserSummary.mockResolvedValue(summary);
      mocks.discord.findOpenTicketThread.mockResolvedValue(void 0);
      const send = jest.fn();
      mocks.discord.createTicketThread.mockResolvedValue(asThread({ id: 'thread-1', send }));
      const interaction = newModalInteraction('My backups are failing.');

      await sut.handleInteraction(interaction);

      expect(mocks.discord.createTicketThread).toHaveBeenCalledWith('ticket-someone-6789', '123456789');
      expect(send).toHaveBeenCalled();
      expect(mocks.discord.createStaffThread).toHaveBeenCalledWith(
        'staff-someone-6789',
        expect.stringContaining('someone@example.test'),
      );
      expect(mocks.discord.createStaffThread).toHaveBeenCalledWith(
        'staff-someone-6789',
        expect.stringContaining('/d/yucca-per-user?var-user=user-1'),
      );
      expect((interaction as { deferReply: jest.Mock }).deferReply).toHaveBeenCalled();
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('thread-1') }),
      );
    });
  });

  describe('staff /ticket command', () => {
    it('rejects non-staff', async () => {
      const interaction = newCommandInteraction({ id: '555', username: 'Guest' });

      await sut.handleInteraction(interaction);

      expect(mocks.discord.createTicketThread).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('staff') }),
      );
    });

    it('opens a ticket for an unlinked user without requiring a link', async () => {
      mocks.api.getLink.mockResolvedValue(null);
      mocks.discord.findOpenTicketThread.mockResolvedValue(void 0);
      const send = jest.fn();
      mocks.discord.createTicketThread.mockResolvedValue(asThread({ id: 'thread-9', send }));
      const interaction = newCommandInteraction(
        { id: '555000', username: 'Guest' },
        { member: { roles: ['staff-role'] } },
      );

      await sut.handleInteraction(interaction);

      expect(mocks.api.createLinkRequest).not.toHaveBeenCalled();
      expect(mocks.discord.createTicketThread).toHaveBeenCalledWith('ticket-guest-5000', '555000');
      expect(mocks.discord.createStaffThread).toHaveBeenCalledWith(
        'staff-guest-5000',
        expect.stringContaining('No linked FUTO Backups account'),
      );
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('thread-9') }),
      );
    });
  });

  describe('close ticket button', () => {
    it('rejects non-staff', async () => {
      const interaction = newButtonInteraction(ComponentId.CloseTicket);

      await sut.handleInteraction(interaction);

      expect(mocks.discord.closeThread).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('staff') }),
      );
    });

    it('locks and archives the ticket and its staff thread for staff', async () => {
      const thread = asThread({ id: 'thread-1', name: 'ticket-someone-6789', parentId: 'support-channel' });
      const staffThread = asThread({ id: 'thread-2', name: 'staff-someone-6789', parentId: 'support-channel' });
      mocks.discord.findSupportThreadByName.mockResolvedValue(staffThread);
      const interaction = newButtonInteraction(ComponentId.CloseTicket, {
        member: { roles: ['staff-role'] },
        channel: thread,
      });

      await sut.handleInteraction(interaction);

      expect(mocks.discord.findSupportThreadByName).toHaveBeenCalledWith('staff-someone-6789');
      expect(mocks.discord.closeThread).toHaveBeenCalledWith(staffThread);
      expect(mocks.discord.closeThread).toHaveBeenCalledWith(thread);
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('closed') }),
      );
    });

    it('refuses to close a non-ticket thread', async () => {
      const thread = asThread({ id: 'thread-1', name: 'staff-someone-6789', parentId: 'support-channel' });
      const interaction = newButtonInteraction(ComponentId.CloseTicket, {
        member: { roles: ['staff-role'] },
        channel: thread,
      });

      await sut.handleInteraction(interaction);

      expect(mocks.discord.closeThread).not.toHaveBeenCalled();
    });
  });
});
