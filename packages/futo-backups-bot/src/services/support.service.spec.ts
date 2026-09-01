import { ThreadChannel } from 'discord.js';
import { ComponentId } from 'src/enum';
import { InviteService } from 'src/services/invite.service';
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
    guildId: 'guild',
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
    guildId: 'guild',
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
    guildId: 'guild',
    user: { id: '123456789', username: 'Someone' },
    replied: false,
    deferred: false,
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
    fields: { getTextInputValue: jest.fn().mockReturnValue(description) },
    ...overrides,
  }) as never;

const humanMessage = (ts: number) => ({ author: { bot: false }, createdTimestamp: ts, components: [] }) as never;
const promptMessage = (ts: number, del = jest.fn().mockResolvedValue(void 0)) =>
  ({
    author: { bot: true },
    createdTimestamp: ts,
    components: [{ components: [{ customId: ComponentId.ClaimRole }] }],
    delete: del,
  }) as never;

const asThread = (properties: object): ThreadChannel =>
  Object.assign(Object.create(ThreadChannel.prototype) as ThreadChannel, properties);

describe(SupportService.name, () => {
  let sut: SupportService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new SupportService(
      mocks.logger as never,
      mocks.discord as never,
      mocks.api as never,
      new InviteService(mocks.logger as never, mocks.discord as never, mocks.api as never),
      mocks.freshdeskSync as never,
      mocks.columbo as never,
    );
  });

  describe('guild scoping', () => {
    it('ignores an interaction from another guild', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      const interaction = newButtonInteraction(ComponentId.OpenTicket, { guildId: 'other-guild' });

      await sut.handleInteraction(interaction);

      expect(mocks.api.getLink).not.toHaveBeenCalled();
      expect((interaction as { showModal: jest.Mock }).showModal).not.toHaveBeenCalled();
    });
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

    it('backfills a stale stored username', async () => {
      mocks.api.getLink.mockResolvedValue({ ...link, discordUsername: '' });
      mocks.api.updateLinkUsername.mockResolvedValue(void 0);
      const interaction = newButtonInteraction(ComponentId.OpenTicket);

      await sut.handleInteraction(interaction);

      expect(mocks.api.updateLinkUsername).toHaveBeenCalledWith('123456789', 'Someone');
    });
  });

  describe('ticket modal', () => {
    it('blocks a fourth concurrent ticket', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      mocks.discord.listOpenTicketThreads.mockResolvedValue([
        asThread({ id: 'thread-1', name: 'ticket-someone-6789-a' }),
        asThread({ id: 'thread-2', name: 'ticket-someone-6789-b' }),
        asThread({ id: 'thread-3', name: 'ticket-someone-6789-c' }),
      ]);
      const interaction = newModalInteraction('My backups are failing.');

      await sut.handleInteraction(interaction);

      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('3 open tickets') }),
      );
      expect(mocks.discord.createTicketThread).not.toHaveBeenCalled();
    });

    it('creates the ticket thread with a staff thread and replies with a pointer', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      mocks.api.getUserSummary.mockResolvedValue(summary);
      const send = jest.fn().mockResolvedValue({ id: 'seed-1' });
      mocks.discord.createTicketThread.mockResolvedValue(asThread({ id: 'thread-1', send }));
      const interaction = newModalInteraction('My backups are failing.');

      await sut.handleInteraction(interaction);

      expect(mocks.discord.createTicketThread).toHaveBeenCalledWith(
        expect.stringMatching(/^ticket-someone-6789-/),
        '123456789',
      );
      expect(send).toHaveBeenCalled();
      expect(mocks.discord.createStaffThread).toHaveBeenCalledWith(
        expect.stringMatching(/^staff-someone-6789-/),
        expect.stringContaining('someone@example.test'),
      );
      expect(mocks.discord.createStaffThread).toHaveBeenCalledWith(
        expect.stringMatching(/^staff-someone-6789-/),
        expect.stringContaining('/d/yucca-per-user?var-user=user-1'),
      );
      expect((interaction as { deferReply: jest.Mock }).deferReply).toHaveBeenCalled();
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('thread-1') }),
      );
      expect(mocks.freshdeskSync.onTicketOpened).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-1',
          seedMessageId: 'seed-1',
          staffThreadId: 'staff-thread-1',
          staffSeedMessageId: 'staff-seed-1',
          userId: 'user-1',
          description: 'My backups are failing.',
        }),
      );
      expect(mocks.columbo.requestInvestigation).toHaveBeenCalledWith({
        ticketThreadId: 'thread-1',
        staffThreadId: 'staff-thread-1',
        discordUserId: '123456789',
        username: 'Someone',
        userId: 'user-1',
        description: 'My backups are failing.',
      });
    });
  });

  describe('staff note posting', () => {
    it('posts into a staff thread', async () => {
      mocks.discord.getThreadById.mockResolvedValue(
        asThread({ id: 'staff-thread-1', name: 'staff-someone-6789-a', parentId: 'support-channel' }) as never,
      );

      await sut.postStaffNote('staff-thread-1', 'Nothing suspicious in the logs.');

      expect(mocks.discord.sendToThread).toHaveBeenCalledWith(
        'staff-thread-1',
        expect.objectContaining({ embeds: [expect.anything()] }),
      );
    });

    it('refuses a thread that is not a staff thread', async () => {
      mocks.discord.getThreadById.mockResolvedValue(
        asThread({ id: 'thread-1', name: 'ticket-someone-6789-a', parentId: 'support-channel' }) as never,
      );

      await expect(sut.postStaffNote('thread-1', 'note')).rejects.toThrow('not a staff thread');
      expect(mocks.discord.sendToThread).not.toHaveBeenCalled();
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
      const send = jest.fn().mockResolvedValue({ id: 'seed-9' });
      mocks.discord.createTicketThread.mockResolvedValue(asThread({ id: 'thread-9', send }));
      const interaction = newCommandInteraction(
        { id: '555000', username: 'Guest' },
        { member: { roles: ['staff-role'] } },
      );

      await sut.handleInteraction(interaction);

      expect(mocks.api.createLinkRequest).not.toHaveBeenCalled();
      expect(mocks.discord.createTicketThread).toHaveBeenCalledWith(
        expect.stringMatching(/^ticket-guest-5000-/),
        '555000',
      );
      expect(mocks.discord.createStaffThread).toHaveBeenCalledWith(
        expect.stringMatching(/^staff-guest-5000-/),
        expect.stringContaining('No linked FUTO Backups account'),
      );
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('thread-9') }),
      );
    });
  });

  describe('/claim-backups-role command', () => {
    it('grants the customer role to a linked user', async () => {
      mocks.api.getLink.mockResolvedValue(link);
      const interaction = newCommandInteraction(
        {},
        { commandName: 'claim-backups-role', user: { id: '123456789', username: 'Someone' } },
      );

      await sut.handleInteraction(interaction);

      expect(mocks.discord.addRoleToMember).toHaveBeenCalledWith('123456789', 'customer-role');
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('chat-channel') }),
      );
    });

    it('grants the role after linking for an unlinked user', async () => {
      mocks.api.getLink.mockResolvedValueOnce(null).mockResolvedValue(link);
      mocks.api.createLinkRequest.mockResolvedValue({ code: 'code-1', expiresAt: new Date(Date.now() + 2000) });
      const interaction = newCommandInteraction(
        {},
        { commandName: 'claim-backups-role', user: { id: '123456789', username: 'Someone' } },
      );

      await sut.handleInteraction(interaction);

      expect(mocks.api.createLinkRequest).toHaveBeenCalledWith('123456789', 'Someone');
      expect(mocks.discord.addRoleToMember).toHaveBeenCalledWith('123456789', 'customer-role');
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('role claimed') }),
      );
    });
  });

  describe('daily claim prompt', () => {
    it('skips a quiet channel', async () => {
      mocks.discord.listRecentMessages.mockResolvedValue([humanMessage(1), humanMessage(2)]);

      await sut.postClaimPrompt();

      expect(mocks.discord.sendMessage).not.toHaveBeenCalled();
    });

    it('replaces the old prompt when the channel is active', async () => {
      const del = jest.fn().mockResolvedValue(void 0);
      const messages = [promptMessage(100, del), ...Array.from({ length: 30 }, (_, i) => humanMessage(200 + i))];
      mocks.discord.listRecentMessages.mockResolvedValue(messages);

      await sut.postClaimPrompt();

      expect(del).toHaveBeenCalled();
      expect(mocks.discord.sendMessage).toHaveBeenCalledWith(
        'general-channel',
        expect.objectContaining({ content: expect.stringContaining('chat-channel') }),
      );
    });

    it('ignores activity that predates the last prompt', async () => {
      const messages = [...Array.from({ length: 30 }, (_, i) => humanMessage(10 + i)), promptMessage(100)];
      mocks.discord.listRecentMessages.mockResolvedValue(messages);

      await sut.postClaimPrompt();

      expect(mocks.discord.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('/staff-notes command', () => {
    it('links the paired staff thread for staff inside a ticket', async () => {
      const thread = asThread({ id: 'thread-1', name: 'ticket-someone-6789-x', parentId: 'support-channel' });
      mocks.discord.findSupportThreadByName.mockResolvedValue(
        asThread({ id: 'thread-2', name: 'staff-someone-6789-x' }),
      );
      const interaction = newCommandInteraction(
        {},
        { commandName: 'staff-notes', member: { roles: ['staff-role'] }, channel: thread },
      );

      await sut.handleInteraction(interaction);

      expect(mocks.discord.findSupportThreadByName).toHaveBeenCalledWith('staff-someone-6789-x', true);
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('thread-2') }),
      );
    });

    it('rejects non-staff', async () => {
      const thread = asThread({ id: 'thread-1', name: 'ticket-someone-6789-x', parentId: 'support-channel' });
      const interaction = newCommandInteraction({}, { commandName: 'staff-notes', channel: thread });

      await sut.handleInteraction(interaction);

      expect(mocks.discord.findSupportThreadByName).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('staff') }),
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
