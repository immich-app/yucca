import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { DiscordService } from 'src/services/discord.service';
import { Mocks, newMocks } from '../../test/mocks';

describe(DiscordService.name, () => {
  let sut: DiscordService;
  let mocks: Mocks;

  const request = {
    id: 'request-id',
    code: 'code',
    allowlistId: null,
    discordUserId: '123456789',
    discordUsername: 'someone',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };

  const auth = { id: 'user-id' } as AuthDto;

  beforeEach(() => {
    mocks = newMocks();
    sut = new DiscordService(mocks.discord as never, mocks.crypto as never);
  });

  describe('createLinkRequest', () => {
    it('prunes expired requests and mints a single-use code', async () => {
      mocks.crypto.randomHex.mockReturnValue('code');
      mocks.discord.createRequest.mockResolvedValue(request);

      await expect(sut.createLinkRequest({ discordUserId: '123456789', discordUsername: 'someone' })).resolves.toEqual({
        code: 'code',
        expiresAt: request.expiresAt,
      });

      expect(mocks.discord.deleteExpiredRequests).toHaveBeenCalled();
      expect(mocks.discord.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'code', discordUserId: '123456789', discordUsername: 'someone' }),
      );
    });
  });

  describe('getLinkRequest', () => {
    it('returns the discord username for a valid code', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue(request);

      await expect(sut.getLinkRequest('code')).resolves.toEqual({ discordUsername: 'someone' });
    });

    it('rejects an unknown code', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue(void 0);

      await expect(sut.getLinkRequest('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an expired code', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue({ ...request, expiresAt: new Date(Date.now() - 1) });

      await expect(sut.getLinkRequest('code')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('confirmLinkRequest', () => {
    it('links the authenticated user to the requesting discord account', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue(request);
      mocks.discord.link.mockResolvedValue({
        id: 'link-id',
        userId: 'user-id',
        discordUserId: '123456789',
        discordUsername: 'someone',
        createdAt: request.createdAt,
      });

      await sut.confirmLinkRequest(auth, 'code');

      expect(mocks.discord.link).toHaveBeenCalledWith('request-id', 'user-id', '123456789', 'someone');
    });

    it('rejects a code consumed by a concurrent confirmation', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue(request);
      mocks.discord.link.mockResolvedValue(null);

      await expect(sut.confirmLinkRequest(auth, 'code')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not link on an expired code', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue({ ...request, expiresAt: new Date(Date.now() - 1) });

      await expect(sut.confirmLinkRequest(auth, 'code')).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.discord.link).not.toHaveBeenCalled();
    });
  });

  describe('updateLinkUsername', () => {
    it('updates the stored username', async () => {
      mocks.discord.updateUsername.mockResolvedValue(true);

      await sut.updateLinkUsername('123456789', { discordUsername: 'renamed' });

      expect(mocks.discord.updateUsername).toHaveBeenCalledWith('123456789', 'renamed');
    });

    it('rejects an unlinked discord user', async () => {
      mocks.discord.updateUsername.mockResolvedValue(false);

      await expect(sut.updateLinkUsername('123456789', { discordUsername: 'renamed' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getLink', () => {
    it('rejects an unlinked discord user', async () => {
      mocks.discord.getLinkByDiscordUserId.mockResolvedValue(void 0);

      await expect(sut.getLink('123456789')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createInvite', () => {
    const entry = { id: 'entry' } as never;

    it('mints a claim and a single-use token', async () => {
      mocks.crypto.randomHex.mockReturnValueOnce('invite-code').mockReturnValueOnce('token');
      mocks.discord.claimInvite.mockResolvedValue({ status: 'ok', entry, remaining: 2 });
      mocks.discord.createRequest.mockResolvedValue({ ...request, code: 'token', allowlistId: 'entry' });

      await expect(
        sut.createInvite({ discordUserId: '123456789', discordUsername: 'someone', batchId: 'batch' }),
      ).resolves.toEqual({ code: 'token', expiresAt: request.expiresAt, remaining: 2 });

      expect(mocks.discord.claimInvite).toHaveBeenCalledWith('123456789', 'someone', 'batch', 'invite-code');
      expect(mocks.discord.createRequest).toHaveBeenCalledWith(expect.objectContaining({ allowlistId: 'entry' }));
    });

    it('re-issues a token for an existing unused claim without consuming a batch slot', async () => {
      mocks.crypto.randomHex.mockReturnValueOnce('invite-code').mockReturnValueOnce('token');
      mocks.discord.claimInvite.mockResolvedValue({ status: 'ok', entry, remaining: null });
      mocks.discord.createRequest.mockResolvedValue({ ...request, code: 'token', allowlistId: 'entry' });

      await expect(sut.createInvite({ discordUserId: '123456789', discordUsername: 'someone' })).resolves.toEqual(
        expect.objectContaining({ remaining: null }),
      );
    });

    it.each([
      ['linked', 'ALREADY_LINKED'],
      ['used', 'INVITE_USED'],
      ['exhausted', 'BATCH_EXHAUSTED'],
      ['cancelled', 'BATCH_CANCELLED'],
    ] as const)('rejects a %s claim with a conflict', async (status, message) => {
      mocks.discord.claimInvite.mockResolvedValue({ status });

      await expect(sut.createInvite({ discordUserId: '123456789', discordUsername: 'someone' })).rejects.toThrow(
        new ConflictException(message),
      );
      expect(mocks.discord.createRequest).not.toHaveBeenCalled();
    });

    it('rejects an unknown batch', async () => {
      mocks.discord.claimInvite.mockResolvedValue({ status: 'unknownBatch' });

      await expect(
        sut.createInvite({ discordUserId: '123456789', discordUsername: 'someone', batchId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getInvite', () => {
    it('returns the discord username for a valid invite token', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue({ ...request, allowlistId: 'entry' });

      await expect(sut.getInvite('code')).resolves.toEqual({ discordUsername: 'someone' });
    });

    it('rejects a link-request token that is not an invite', async () => {
      mocks.discord.getRequestByCode.mockResolvedValue({ ...request, allowlistId: null });

      await expect(sut.getInvite('code')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setInviteBatchMessage', () => {
    it('rejects an unknown batch', async () => {
      mocks.discord.setBatchMessage.mockResolvedValue(false);

      await expect(sut.setInviteBatchMessage('nope', { messageId: 'message' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getUserSummary', () => {
    it('coerces counts to numbers', async () => {
      mocks.discord.getUserSummary.mockResolvedValue({
        id: 'user-id',
        name: 'Someone',
        email: 'someone@example.test',
        createdAt: request.createdAt,
        connectionCount: '2' as never,
        repositoryCount: null,
        lastSeenAt: null,
      });

      await expect(sut.getUserSummary('user-id')).resolves.toEqual(
        expect.objectContaining({ connectionCount: 2, repositoryCount: 0 }),
      );
    });

    it('rejects an unknown user', async () => {
      mocks.discord.getUserSummary.mockResolvedValue(void 0);

      await expect(sut.getUserSummary('user-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('tickets', () => {
    const ticket = {
      id: 'ticket-id',
      threadId: 'thread-1',
      staffThreadId: 'staff-1',
      freshdeskTicketId: '42',
      discordUserId: '123456789',
      userId: 'user-id',
      emailSubscribed: false,
      lastMirroredMessageId: null,
      lastStaffMirroredMessageId: null,
      lastFreshdeskConversationId: null,
      closedAt: null,
      createdAt: new Date(),
    };

    it('creates a mapping with defaulted nullables', async () => {
      mocks.discord.createTicket.mockResolvedValue(ticket);

      await expect(
        sut.createTicket({ threadId: 'thread-1', freshdeskTicketId: '42', discordUserId: '123456789' }),
      ).resolves.toEqual(ticket);

      expect(mocks.discord.createTicket).toHaveBeenCalledWith({
        threadId: 'thread-1',
        staffThreadId: null,
        freshdeskTicketId: '42',
        discordUserId: '123456789',
        userId: null,
        lastMirroredMessageId: null,
        lastStaffMirroredMessageId: null,
      });
    });

    it('rejects an unknown thread', async () => {
      mocks.discord.getTicketByThread.mockResolvedValue(void 0);

      await expect(sut.getTicketByThread('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an unknown freshdesk ticket', async () => {
      mocks.discord.getTicketByFreshdeskId.mockResolvedValue(void 0);

      await expect(sut.getTicketByFreshdeskId('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('translates closed into a closedAt timestamp', async () => {
      await sut.updateTicket('ticket-id', { closed: true, lastFreshdeskConversationId: '7' });

      expect(mocks.discord.updateTicket).toHaveBeenCalledWith('ticket-id', {
        lastFreshdeskConversationId: '7',
        closedAt: expect.any(Date),
      });
    });

    it('leaves closedAt untouched when closed is not passed', async () => {
      await sut.updateTicket('ticket-id', { emailSubscribed: true });

      expect(mocks.discord.updateTicket).toHaveBeenCalledWith('ticket-id', { emailSubscribed: true });
    });

    it('rejects updates to an unknown ticket', async () => {
      mocks.discord.updateTicket.mockResolvedValue(false);

      await expect(sut.updateTicket('ticket-id', { closed: true })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
