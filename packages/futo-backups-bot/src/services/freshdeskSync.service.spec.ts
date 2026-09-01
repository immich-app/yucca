import { FreshdeskSyncService } from 'src/services/freshdeskSync.service';
import { Mocks, newMocks } from '../../test/mocks';

const mapping = {
  id: 'map-1',
  threadId: 'thread-1',
  staffThreadId: 'staff-1',
  freshdeskTicketId: '42',
  discordUserId: 'cust',
  userId: 'user-1',
  emailSubscribed: false,
  lastMirroredMessageId: 'seed',
  lastStaffMirroredMessageId: 'staff-seed',
  lastFreshdeskConversationId: null,
  closedAt: null,
};

const summary = {
  id: 'user-1',
  name: 'Someone',
  email: 'someone@example.test',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  connectionCount: 1,
  repositoryCount: 2,
  lastSeenAt: null,
};

const msg = (id: string, authorId: string, overrides: object = {}) =>
  ({
    id,
    author: { id: authorId, bot: false, username: `user-${authorId}` },
    content: `message ${id}`,
    attachments: new Map(),
    ...overrides,
  }) as never;

const inThread = (message: object, channelId: string) =>
  ({
    ...message,
    channel: { isThread: () => true, parentId: 'support-channel', id: channelId },
  }) as never;

const conversation = (id: number, overrides: object = {}) => ({
  id,
  body_text: `conversation ${id}`,
  user_id: 9,
  private: false,
  incoming: false,
  attachments: [],
  ...overrides,
});

const newInteraction = (overrides: object = {}) =>
  ({
    channelId: 'thread-1',
    user: { id: 'cust', username: 'someone' },
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
    ...overrides,
  }) as never;

const staffInteraction = (overrides: object = {}) =>
  newInteraction({ user: { id: 'staff', username: 'staffer' }, member: { roles: ['staff-role'] }, ...overrides });

describe(FreshdeskSyncService.name, () => {
  let sut: FreshdeskSyncService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new FreshdeskSyncService(
      mocks.logger as never,
      mocks.discord as never,
      mocks.freshdesk as never,
      mocks.api as never,
    );
  });

  describe('onTicketOpened', () => {
    it('creates the freshdesk ticket with a dummy requester and registers the mapping', async () => {
      mocks.freshdesk.createTicket.mockResolvedValue('42');
      mocks.api.createTicketMapping.mockResolvedValue(mapping);

      await sut.onTicketOpened({
        threadId: 'thread-1',
        seedMessageId: 'seed',
        staffThreadId: 'staff-1',
        staffSeedMessageId: 'staff-seed',
        discordUserId: 'cust',
        username: 'someone',
        userId: 'user-1',
        description: 'backups fail\nwith an error',
        staffNote: 'account context',
      });

      expect(mocks.freshdesk.createTicket).toHaveBeenCalledWith({
        email: 'cust@no.futo.org',
        name: 'someone',
        subject: '[Discord] someone: backups fail',
        description: 'backups fail<br>with an error',
      });
      expect(mocks.api.createTicketMapping).toHaveBeenCalledWith({
        threadId: 'thread-1',
        staffThreadId: 'staff-1',
        freshdeskTicketId: '42',
        discordUserId: 'cust',
        userId: 'user-1',
        lastMirroredMessageId: 'seed',
        lastStaffMirroredMessageId: 'staff-seed',
      });
      expect(mocks.freshdesk.createNote).toHaveBeenCalledWith('42', expect.stringContaining('account context'), {
        private: true,
      });
    });
  });

  describe('handleMessage', () => {
    it('mirrors buffered staff messages and the customer message in order', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.discord.fetchMessagesAfter.mockResolvedValue([msg('m1', 'staff'), msg('m2', 'cust')]);

      await sut.handleMessage(inThread(msg('m2', 'cust'), 'thread-1'));

      expect(mocks.freshdesk.createReply).toHaveBeenCalledWith('42', expect.stringContaining('user-staff'), []);
      expect(mocks.freshdesk.createNote).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('user-cust'),
        { private: false, incoming: true },
        [],
      );
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { lastMirroredMessageId: 'm1' });
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { lastMirroredMessageId: 'm2' });
    });

    it('holds back a trailing staff group until the debounce fires', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.discord.fetchMessagesAfter.mockResolvedValue([msg('m1', 'cust'), msg('m2', 'staff')]);

      await sut.handleMessage(inThread(msg('m1', 'cust'), 'thread-1'));

      expect(mocks.freshdesk.createNote).toHaveBeenCalledTimes(1);
      expect(mocks.freshdesk.createReply).not.toHaveBeenCalled();
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { lastMirroredMessageId: 'm1' });
      expect(mocks.api.updateTicket).not.toHaveBeenCalledWith('map-1', { lastMirroredMessageId: 'm2' });
    });

    it('debounces staff messages into one combined reply', async () => {
      jest.useFakeTimers();
      try {
        mocks.api.getTicketByThread.mockResolvedValue(mapping);
        mocks.discord.fetchMessagesAfter.mockResolvedValue([msg('m1', 'staff-a'), msg('m2', 'staff-b')]);

        await sut.handleMessage(inThread(msg('m1', 'staff-a'), 'thread-1'));
        await sut.handleMessage(inThread(msg('m2', 'staff-b'), 'thread-1'));
        expect(mocks.freshdesk.createReply).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(120_000);

        expect(mocks.freshdesk.createReply).toHaveBeenCalledTimes(1);
        expect(mocks.freshdesk.createReply).toHaveBeenCalledWith('42', expect.stringContaining('user-staff-a'), []);
        expect(mocks.freshdesk.createReply).toHaveBeenCalledWith('42', expect.stringContaining('user-staff-b'), []);
      } finally {
        jest.useRealTimers();
      }
    });

    it('mirrors staff-thread messages as private notes', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.discord.fetchMessagesAfter.mockResolvedValue([msg('s1', 'staff')]);

      await sut.handleMessage(inThread(msg('s1', 'staff'), 'staff-1'));

      expect(mocks.discord.fetchMessagesAfter).toHaveBeenCalledWith('staff-1', 'staff-seed');
      expect(mocks.freshdesk.createNote).toHaveBeenCalledWith(
        '42',
        expect.stringContaining('staff notes'),
        { private: true },
        [],
      );
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { lastStaffMirroredMessageId: 's1' });
    });

    it('ignores threads without a mapping', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(null);

      await sut.handleMessage(inThread(msg('m1', 'cust'), 'thread-9'));

      expect(mocks.freshdesk.createNote).not.toHaveBeenCalled();
      expect(mocks.freshdesk.createReply).not.toHaveBeenCalled();
    });
  });

  describe('onFreshdeskPing', () => {
    it('posts agent replies and skips private and own conversations', async () => {
      mocks.api.getTicketByFreshdeskId.mockResolvedValue(mapping);
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.freshdesk.listConversationsAfter.mockResolvedValue([
        conversation(5),
        conversation(6, { user_id: 1 }),
        conversation(7, { private: true }),
      ] as never);

      await sut.onFreshdeskPing('42');

      expect(mocks.discord.sendToThread).toHaveBeenCalledTimes(1);
      expect(mocks.discord.sendToThread).toHaveBeenCalledWith('thread-1', expect.objectContaining({ files: [] }));
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { lastFreshdeskConversationId: '5' });
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { lastFreshdeskConversationId: '7' });
    });

    it('closes the discord side and swaps the requester when the ticket is resolved', async () => {
      mocks.api.getTicketByFreshdeskId.mockResolvedValue(mapping);
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.freshdesk.getTicketStatus.mockResolvedValue(4);
      mocks.api.getUserSummary.mockResolvedValue(summary);
      mocks.discord.getThreadById.mockResolvedValue({} as never);

      await sut.onFreshdeskPing('42');

      expect(mocks.discord.sendToThread).toHaveBeenCalledWith(
        'thread-1',
        expect.objectContaining({ content: expect.stringContaining('resolved') }),
      );
      expect(mocks.discord.closeThread).toHaveBeenCalledTimes(2);
      expect(mocks.freshdesk.resolveTicket).not.toHaveBeenCalled();
      expect(mocks.freshdesk.setRequester).toHaveBeenCalledWith('42', 'someone@example.test', 'Someone');
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { closed: true });
    });

    it('ignores unmapped tickets', async () => {
      mocks.api.getTicketByFreshdeskId.mockResolvedValue(null);

      await sut.onFreshdeskPing('9999');

      expect(mocks.freshdesk.listConversationsAfter).not.toHaveBeenCalled();
    });
  });

  describe('onTicketClosed', () => {
    it('resolves the freshdesk ticket and swaps the requester to the real email', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.api.getUserSummary.mockResolvedValue(summary);

      await sut.onTicketClosed('thread-1');

      expect(mocks.freshdesk.resolveTicket).toHaveBeenCalledWith('42');
      expect(mocks.freshdesk.setRequester).toHaveBeenCalledWith('42', 'someone@example.test', 'Someone');
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { closed: true });
    });

    it('keeps the requester when email updates are already on', async () => {
      mocks.api.getTicketByThread.mockResolvedValue({ ...mapping, emailSubscribed: true });

      await sut.onTicketClosed('thread-1');

      expect(mocks.freshdesk.resolveTicket).toHaveBeenCalledWith('42');
      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
    });

    it('skips a ticket without a linked account', async () => {
      mocks.api.getTicketByThread.mockResolvedValue({ ...mapping, userId: null });

      await sut.onTicketClosed('thread-1');

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { closed: true });
    });
  });

  describe('onEmailUpdatesCommand', () => {
    it('subscribes by swapping the requester to the real email', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.api.getUserSummary.mockResolvedValue(summary);
      const interaction = newInteraction();

      await sut.onEmailUpdatesCommand(interaction);

      expect(mocks.freshdesk.setRequester).toHaveBeenCalledWith('42', 'someone@example.test', 'Someone');
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { emailSubscribed: true });
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('someone@example.test') }),
      );
    });

    it('unsubscribes by swapping back to the dummy address', async () => {
      mocks.api.getTicketByThread.mockResolvedValue({ ...mapping, emailSubscribed: true });
      const interaction = newInteraction();

      await sut.onEmailUpdatesCommand(interaction);

      expect(mocks.freshdesk.setRequester).toHaveBeenCalledWith('42', 'cust@no.futo.org', 'someone');
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { emailSubscribed: false });
    });

    it('refuses anyone but the ticket owner', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      const interaction = newInteraction({ user: { id: 'staff', username: 'staffer' } });

      await sut.onEmailUpdatesCommand(interaction);

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('owner') }),
      );
    });

    it('refuses the staff-notes thread', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      const interaction = newInteraction({ channelId: 'staff-1' });

      await sut.onEmailUpdatesCommand(interaction);

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('ticket thread') }),
      );
    });

    it('refuses a ticket without a linked account', async () => {
      mocks.api.getTicketByThread.mockResolvedValue({ ...mapping, userId: null });
      const interaction = newInteraction();

      await sut.onEmailUpdatesCommand(interaction);

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('no linked') }),
      );
    });
  });

  describe('onHandoffCommand', () => {
    it('closes the discord side, swaps the requester and leaves the freshdesk ticket open', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.api.getUserSummary.mockResolvedValue(summary);
      mocks.discord.getThreadById.mockResolvedValue({} as never);
      const interaction = staffInteraction();

      await sut.onHandoffCommand(interaction);

      expect(mocks.freshdesk.setRequester).toHaveBeenCalledWith('42', 'someone@example.test', 'Someone');
      expect(mocks.freshdesk.resolveTicket).not.toHaveBeenCalled();
      expect(mocks.freshdesk.createNote).toHaveBeenCalledWith('42', expect.stringContaining('staffer'), {
        private: true,
      });
      expect(mocks.discord.sendToThread).toHaveBeenCalledWith(
        'thread-1',
        expect.objectContaining({ content: expect.stringContaining('<@cust>') }),
      );
      expect(mocks.discord.closeThread).toHaveBeenCalledTimes(2);
      expect(mocks.api.updateTicket).toHaveBeenCalledWith('map-1', { closed: true });
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Handed off') }),
      );
    });

    it('refuses non-staff', async () => {
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      const interaction = newInteraction({ member: { roles: [] as string[] } });

      await sut.onHandoffCommand(interaction);

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('staff') }),
      );
    });

    it('refuses a ticket without a linked account', async () => {
      mocks.api.getTicketByThread.mockResolvedValue({ ...mapping, userId: null });
      const interaction = staffInteraction();

      await sut.onHandoffCommand(interaction);

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect(mocks.discord.closeThread).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('no linked') }),
      );
    });

    it('refuses an already-closed ticket', async () => {
      mocks.api.getTicketByThread.mockResolvedValue({ ...mapping, closedAt: new Date() });
      const interaction = staffInteraction();

      await sut.onHandoffCommand(interaction);

      expect(mocks.freshdesk.setRequester).not.toHaveBeenCalled();
      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('already closed') }),
      );
    });
  });

  describe('poll', () => {
    it('force-mirrors open tickets and ingests only updated ones', async () => {
      mocks.api.listOpenTickets.mockResolvedValue([mapping]);
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.freshdesk.listUpdatedTicketIds.mockResolvedValue(['42']);
      mocks.discord.fetchMessagesAfter.mockResolvedValue([msg('m1', 'staff')]);
      mocks.freshdesk.listConversationsAfter.mockResolvedValue([conversation(5)] as never);

      await sut.poll();

      expect(mocks.freshdesk.createReply).toHaveBeenCalled();
      expect(mocks.discord.sendToThread).toHaveBeenCalledWith('thread-1', expect.anything());
    });

    it('skips ingest for tickets that did not change', async () => {
      mocks.api.listOpenTickets.mockResolvedValue([mapping]);
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.freshdesk.listUpdatedTicketIds.mockResolvedValue([]);

      await sut.poll();

      expect(mocks.freshdesk.listConversationsAfter).not.toHaveBeenCalled();
    });

    it('ingests every open ticket when the updated listing overflows', async () => {
      mocks.api.listOpenTickets.mockResolvedValue([mapping]);
      mocks.api.getTicketByThread.mockResolvedValue(mapping);
      mocks.freshdesk.listUpdatedTicketIds.mockResolvedValue(null);

      await sut.poll();

      expect(mocks.freshdesk.listConversationsAfter).toHaveBeenCalledWith('42', null);
    });
  });
});
