import { ConflictException, NotFoundException } from '@nestjs/common';
import { DiscordInviteService } from 'src/services/discordInvite.service';
import { Mocks, newMocks } from '../../test/mocks';

const claim = {
  id: 'claim-1',
  email: null,
  inviteCode: 'code',
  invited: true,
  inviteUsed: false,
  inviteUsedAt: null,
  inviteEmailSentAt: null,
  discordUserId: '123456789',
  discordUsername: 'someone',
  batchId: 'batch-1',
  createdAt: new Date(),
};

const batch = {
  id: 'batch-1',
  guildId: 'guild-1',
  channelId: 'channel-1',
  messageId: 'message-1',
  maxClaims: 10,
  createdByDiscordUserId: 'staff-1',
  cancelledAt: null,
  createdAt: new Date(),
  claimed: 3,
  used: 1,
};

describe(DiscordInviteService.name, () => {
  let sut: DiscordInviteService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new DiscordInviteService(mocks.discordInvite as never, mocks.bot as never, mocks.logger as never);
  });

  describe('revokeClaim', () => {
    it('deletes an unredeemed claim', async () => {
      mocks.discordInvite.getClaim.mockResolvedValue(claim);

      await sut.revokeClaim('123456789');

      expect(mocks.discordInvite.deleteClaim).toHaveBeenCalledWith('claim-1', '123456789');
    });

    it('rejects an unknown claim', async () => {
      mocks.discordInvite.getClaim.mockResolvedValue(void 0);

      await expect(sut.revokeClaim('123456789')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a redeemed claim', async () => {
      mocks.discordInvite.getClaim.mockResolvedValue({ ...claim, inviteUsed: true });

      await expect(sut.revokeClaim('123456789')).rejects.toBeInstanceOf(ConflictException);
      expect(mocks.discordInvite.deleteClaim).not.toHaveBeenCalled();
    });

    it('refuses a claim redeemed between the read and the delete', async () => {
      mocks.discordInvite.getClaim.mockResolvedValue(claim);
      mocks.discordInvite.deleteClaim.mockResolvedValue('used');

      await expect(sut.revokeClaim('123456789')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a claim whose discord account got linked mid-redemption', async () => {
      mocks.discordInvite.getClaim.mockResolvedValue(claim);
      mocks.discordInvite.deleteClaim.mockResolvedValue('linked');

      await expect(sut.revokeClaim('123456789')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancelBatch', () => {
    beforeEach(() => {
      mocks.discordInvite.getBatch.mockResolvedValue(batch);
    });

    it('soft-cancels and eagerly closes the drop message', async () => {
      await expect(sut.cancelBatch('batch-1', false)).resolves.toEqual(
        expect.objectContaining({ revokedClaims: 0, batch: expect.objectContaining({ claimed: 3, used: 1 }) }),
      );

      expect(mocks.discordInvite.cancelBatch).toHaveBeenCalledWith('batch-1', false);
      expect(mocks.bot.closeDrop).toHaveBeenCalledWith('batch-1', 'channel-1', 'message-1');
    });

    it('revokes unredeemed claims when asked', async () => {
      mocks.discordInvite.cancelBatch.mockResolvedValue(2);

      await expect(sut.cancelBatch('batch-1', true)).resolves.toEqual(expect.objectContaining({ revokedClaims: 2 }));

      expect(mocks.discordInvite.cancelBatch).toHaveBeenCalledWith('batch-1', true);
    });

    it('survives a failed bot notification', async () => {
      mocks.bot.closeDrop.mockRejectedValue(new Error('bot down'));

      await expect(sut.cancelBatch('batch-1', false)).resolves.toBeDefined();

      expect(mocks.logger.warn).toHaveBeenCalled();
    });

    it('skips the bot when the batch has no posted message', async () => {
      mocks.discordInvite.getBatch.mockResolvedValue({ ...batch, messageId: null });

      await sut.cancelBatch('batch-1', false);

      expect(mocks.bot.closeDrop).not.toHaveBeenCalled();
    });

    it('rejects an unknown batch', async () => {
      mocks.discordInvite.getBatch.mockResolvedValue(void 0);

      await expect(sut.cancelBatch('nope', false)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
