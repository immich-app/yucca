import { ComponentId } from 'src/enum';
import { env } from 'src/env';
import { Messages } from 'src/messages';
import { InviteService } from 'src/services/invite.service';
import { Mocks, newMocks } from '../../test/mocks';

const okInvite = { status: 'ok', code: 'token', expiresAt: new Date(Date.now() + 600_000), remaining: null } as const;

const newCommandInteraction = (options: Record<string, unknown>, overrides: object = {}) =>
  ({
    isButton: () => false,
    isModalSubmit: () => false,
    isChatInputCommand: () => true,
    commandName: 'beta-invite',
    user: { id: 'staff-1', username: 'Staffer' },
    guildId: 'guild-1',
    options: {
      getUser: jest.fn().mockReturnValue(options.user ?? null),
      getChannel: jest.fn().mockReturnValue(options.channel ?? null),
      getInteger: jest.fn().mockReturnValue(options.limit ?? null),
      getRole: jest.fn().mockReturnValue(options.mention ?? null),
    },
    replied: false,
    deferred: false,
    reply: jest.fn().mockResolvedValue(void 0),
    deferReply: jest.fn().mockResolvedValue(void 0),
    editReply: jest.fn().mockResolvedValue(void 0),
    member: { roles: ['staff-role'] as string[] },
    ...overrides,
  }) as never;

const newClaimInteraction = (overrides: object = {}) =>
  ({
    isButton: () => true,
    isModalSubmit: () => false,
    isChatInputCommand: () => false,
    customId: `${ComponentId.ClaimInvite}:batch-1`,
    user: { id: '123456789', username: 'Someone' },
    message: { edit: jest.fn().mockResolvedValue(void 0) },
    replied: false,
    deferred: false,
    reply: jest.fn().mockResolvedValue(void 0),
    deferReply: jest.fn().mockResolvedValue(void 0),
    editReply: jest.fn().mockResolvedValue(void 0),
    ...overrides,
  }) as never;

describe(InviteService.name, () => {
  let sut: InviteService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new InviteService(mocks.logger as never, mocks.discord as never, mocks.api as never);
    env.DISCORD_STAFF_ROLE_ID = 'staff-role';
  });

  describe('onInviteCommand', () => {
    it('refuses non-staff invokers', async () => {
      const interaction = newCommandInteraction({ user: { id: 'u1' } }, { member: { roles: [] as string[] } });

      await sut.onInviteCommand(interaction);

      expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: Messages.inviteStaffOnly }),
      );
      expect(mocks.api.createInvite).not.toHaveBeenCalled();
    });

    it('requires exactly one of user and channel', async () => {
      const both = newCommandInteraction({ user: { id: 'u1' }, channel: { id: 'c1' } });
      const neither = newCommandInteraction({});

      await sut.onInviteCommand(both);
      await sut.onInviteCommand(neither);

      for (const interaction of [both, neither]) {
        expect((interaction as { reply: jest.Mock }).reply).toHaveBeenCalledWith(
          expect.objectContaining({ content: Messages.invitePickOne }),
        );
      }
      expect(mocks.api.createInvite).not.toHaveBeenCalled();
    });

    it('DMs a personal invite link in user mode', async () => {
      mocks.api.createInvite.mockResolvedValue(okInvite);
      const interaction = newCommandInteraction({ user: { id: 'u1', username: 'target' } });

      await sut.onInviteCommand(interaction);

      expect(mocks.api.createInvite).toHaveBeenCalledWith('u1', 'target');
      expect(mocks.discord.sendDirectMessage).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ content: Messages.inviteDm }),
      );
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.inviteSent('u1'),
      });
    });

    it('hands the link to the invoker when the target has DMs closed', async () => {
      mocks.api.createInvite.mockResolvedValue(okInvite);
      mocks.discord.sendDirectMessage.mockResolvedValue(false);
      const interaction = newCommandInteraction({ user: { id: 'u1', username: 'target' } });

      await sut.onInviteCommand(interaction);

      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('/login/invite?token=token'),
      });
    });

    it('reports an already-linked target', async () => {
      mocks.api.createInvite.mockResolvedValue({ status: 'already-linked' });
      const interaction = newCommandInteraction({ user: { id: 'u1', username: 'target' } });

      await sut.onInviteCommand(interaction);

      expect(mocks.discord.sendDirectMessage).not.toHaveBeenCalled();
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.inviteAlreadyLinked('u1'),
      });
    });

    it('requires a limit in channel mode', async () => {
      const interaction = newCommandInteraction({ channel: { id: 'c1' } });

      await sut.onInviteCommand(interaction);

      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.inviteLimitRequired,
      });
      expect(mocks.api.createInviteBatch).not.toHaveBeenCalled();
    });

    it('posts a claim button and records the message id in channel mode', async () => {
      mocks.api.createInviteBatch.mockResolvedValue('batch-1');
      mocks.discord.sendMessage.mockResolvedValue({ id: 'message-1' } as never);
      const interaction = newCommandInteraction({ channel: { id: 'c1' }, limit: 10 });

      await sut.onInviteCommand(interaction);

      expect(mocks.api.createInviteBatch).toHaveBeenCalledWith('guild-1', 'c1', 10, 'staff-1');
      expect(mocks.discord.sendMessage).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ content: Messages.inviteDrop(10, null, 'staff-1') }),
      );
      expect(mocks.api.setInviteBatchMessage).toHaveBeenCalledWith('batch-1', 'message-1');
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.inviteDropPosted(10, 'c1'),
      });
    });

    it('mentions the everyone role as a literal @everyone', async () => {
      mocks.api.createInviteBatch.mockResolvedValue('batch-1');
      mocks.discord.sendMessage.mockResolvedValue({ id: 'message-1' } as never);
      const interaction = newCommandInteraction({ channel: { id: 'c1' }, limit: 2, mention: { id: 'guild-1' } });

      await sut.onInviteCommand(interaction);

      expect(mocks.discord.sendMessage).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ content: Messages.inviteDrop(2, '@everyone', 'staff-1') }),
      );
    });

    it('mentions the requested role in the channel post', async () => {
      mocks.api.createInviteBatch.mockResolvedValue('batch-1');
      mocks.discord.sendMessage.mockResolvedValue({ id: 'message-1' } as never);
      const interaction = newCommandInteraction({ channel: { id: 'c1' }, limit: 5, mention: { id: 'role-1' } });

      await sut.onInviteCommand(interaction);

      expect(mocks.discord.sendMessage).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ content: Messages.inviteDrop(5, '<@&role-1>', 'staff-1') }),
      );
    });
  });

  describe('closeDrop', () => {
    it('disables the drop button on the posted message', async () => {
      await sut.closeDrop('batch-1', 'channel-1', 'message-1');

      expect(mocks.discord.editMessage).toHaveBeenCalledWith(
        'channel-1',
        'message-1',
        expect.objectContaining({ components: [expect.anything()] }),
      );
    });
  });

  describe('onClaimInvite', () => {
    it('replies with a personal link on a successful claim', async () => {
      mocks.api.createInvite.mockResolvedValue({ ...okInvite, remaining: 3 });
      const interaction = newClaimInteraction();

      await sut.onClaimInvite(interaction);

      expect(mocks.api.createInvite).toHaveBeenCalledWith('123456789', 'Someone', 'batch-1');
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: Messages.claimSuccess }),
      );
      expect((interaction as { message: { edit: jest.Mock } }).message.edit).not.toHaveBeenCalled();
    });

    it('disables the claim button when the last invite is claimed', async () => {
      mocks.api.createInvite.mockResolvedValue({ ...okInvite, remaining: 0 });
      const interaction = newClaimInteraction();

      await sut.onClaimInvite(interaction);

      expect((interaction as { message: { edit: jest.Mock } }).message.edit).toHaveBeenCalled();
    });

    it('reports exhaustion and disables the button', async () => {
      mocks.api.createInvite.mockResolvedValue({ status: 'exhausted' });
      const interaction = newClaimInteraction();

      await sut.onClaimInvite(interaction);

      expect((interaction as { message: { edit: jest.Mock } }).message.edit).toHaveBeenCalled();
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.claimExhausted,
      });
    });

    it('turns an already-linked claimer away', async () => {
      mocks.api.createInvite.mockResolvedValue({ status: 'already-linked' });
      const interaction = newClaimInteraction();

      await sut.onClaimInvite(interaction);

      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.claimAlreadyLinked,
      });
    });

    it('reports a cancelled drop and disables the button', async () => {
      mocks.api.createInvite.mockResolvedValue({ status: 'cancelled' });
      const interaction = newClaimInteraction();

      await sut.onClaimInvite(interaction);

      expect((interaction as { message: { edit: jest.Mock } }).message.edit).toHaveBeenCalled();
      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.claimDropEnded,
      });
    });

    it('reports a spent invite', async () => {
      mocks.api.createInvite.mockResolvedValue({ status: 'invite-used' });
      const interaction = newClaimInteraction();

      await sut.onClaimInvite(interaction);

      expect((interaction as { editReply: jest.Mock }).editReply).toHaveBeenCalledWith({
        content: Messages.claimInviteUsed,
      });
    });
  });
});
