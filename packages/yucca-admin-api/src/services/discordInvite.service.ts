import { LoggerRepository } from '@common/server/otel';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DiscordInviteBatchCancelResponseDto,
  DiscordInviteBatchDto,
  DiscordInviteBatchListResponseDto,
  DiscordInviteClaimDto,
  DiscordInviteClaimListResponseDto,
} from 'src/dto/discordInvite.dto';
import { DiscordInviteRepository } from 'src/repositories/discordInvite.repository';
import { FutoBackupsBotRepository } from 'src/repositories/futoBackupsBot.repository';

@Injectable()
export class DiscordInviteService {
  constructor(
    private readonly invites: DiscordInviteRepository,
    private readonly bot: FutoBackupsBotRepository,
    private readonly logger: LoggerRepository,
  ) {}

  async listClaims(): Promise<DiscordInviteClaimListResponseDto> {
    const claims = await this.invites.listClaims();
    return {
      items: claims.map(
        (claim): DiscordInviteClaimDto => ({
          id: claim.id,
          discordUserId: claim.discordUserId!,
          discordUsername: claim.discordUsername,
          batchId: claim.batchId,
          inviteUsed: claim.inviteUsed,
          inviteUsedAt: claim.inviteUsedAt,
          createdAt: claim.createdAt,
        }),
      ),
    };
  }

  async revokeClaim(discordUserId: string): Promise<void> {
    const claim = await this.invites.getClaim(discordUserId);
    if (!claim) {
      throw new NotFoundException(`No invite claim for Discord user ${discordUserId}`);
    }
    const result = claim.inviteUsed ? 'used' : await this.invites.deleteClaim(claim.id, discordUserId);
    switch (result) {
      case 'used': {
        throw new ConflictException('Invite already redeemed — manage the account (disable / unlink-discord) instead');
      }
      case 'linked': {
        throw new ConflictException(
          'Discord account is already linked — manage the account (disable / unlink-discord) instead',
        );
      }
      case 'deleted': {
        return;
      }
    }
  }

  async listBatches(): Promise<DiscordInviteBatchListResponseDto> {
    const batches = await this.invites.listBatches();
    return { items: batches.map((batch) => this.toBatchDto(batch)) };
  }

  async cancelBatch(id: string, revokeUnused: boolean): Promise<DiscordInviteBatchCancelResponseDto> {
    const batch = await this.invites.getBatch(id);
    if (!batch) {
      throw new NotFoundException(`No invite batch with id ${id}`);
    }

    const revokedClaims = await this.invites.cancelBatch(id, revokeUnused);

    if (this.bot.enabled && batch.messageId) {
      await this.bot
        .closeDrop(batch.id, batch.channelId, batch.messageId)
        .catch((error: unknown) =>
          this.logger.warn(error, 'could not close the drop message — the bot disables it on the next click'),
        );
    }

    const updated = await this.invites.getBatch(id);
    return { batch: this.toBatchDto(updated!), revokedClaims };
  }

  private toBatchDto(batch: {
    id: string;
    guildId: string;
    channelId: string;
    messageId: string | null;
    maxClaims: number;
    createdByDiscordUserId: string;
    cancelledAt: Date | null;
    createdAt: Date;
    claimed: number | string | bigint;
    used: number | string | bigint;
  }): DiscordInviteBatchDto {
    return {
      id: batch.id,
      guildId: batch.guildId,
      channelId: batch.channelId,
      messageId: batch.messageId,
      maxClaims: batch.maxClaims,
      claimed: Number(batch.claimed),
      used: Number(batch.used),
      createdByDiscordUserId: batch.createdByDiscordUserId,
      cancelledAt: batch.cancelledAt,
      createdAt: batch.createdAt,
    };
  }
}
