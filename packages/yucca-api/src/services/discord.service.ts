import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Duration } from 'luxon';
import { AuthDto } from 'src/dto/auth.dto';
import {
  DiscordInviteBatchCreateDto,
  DiscordInviteBatchDto,
  DiscordInviteBatchMessageDto,
  DiscordInviteCreateDto,
  DiscordInviteCreatedDto,
  DiscordInviteResponseDto,
  DiscordLinkDto,
  DiscordLinkRequestCreateDto,
  DiscordLinkRequestCreatedDto,
  DiscordLinkRequestResponseDto,
  DiscordLinkUsernameUpdateDto,
  DiscordUserSummaryDto,
} from 'src/dto/discord.dto';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { DiscordRepository } from 'src/repositories/discord.repository';

const LINK_REQUEST_TTL = Duration.fromObject({ minutes: 10 });

@Injectable()
export class DiscordService {
  constructor(
    private readonly discord: DiscordRepository,
    private readonly crypto: CryptoRepository,
  ) {}

  async createLinkRequest(dto: DiscordLinkRequestCreateDto): Promise<DiscordLinkRequestCreatedDto> {
    await this.discord.deleteExpiredRequests();
    const request = await this.discord.createRequest({
      code: this.crypto.randomHex(32),
      discordUserId: dto.discordUserId,
      discordUsername: dto.discordUsername,
      expiresAt: new Date(Date.now() + LINK_REQUEST_TTL.toMillis()),
    });
    return { code: request.code, expiresAt: request.expiresAt };
  }

  private async getValidRequest(code: string) {
    const request = await this.discord.getRequestByCode(code);
    if (!request || request.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Unknown or expired link code');
    }
    return request;
  }

  async getLinkRequest(code: string): Promise<DiscordLinkRequestResponseDto> {
    const request = await this.getValidRequest(code);
    return { discordUsername: request.discordUsername };
  }

  async confirmLinkRequest(auth: AuthDto, code: string): Promise<void> {
    const request = await this.getValidRequest(code);
    const link = await this.discord.link(request.id, auth.id, request.discordUserId, request.discordUsername);
    if (!link) {
      throw new NotFoundException('Unknown or expired link code');
    }
  }

  async getLink(discordUserId: string): Promise<DiscordLinkDto> {
    const link = await this.discord.getLinkByDiscordUserId(discordUserId);
    if (!link) {
      throw new NotFoundException(`No link for Discord user ${discordUserId}`);
    }
    return link;
  }

  async updateLinkUsername(discordUserId: string, dto: DiscordLinkUsernameUpdateDto): Promise<void> {
    if (!(await this.discord.updateUsername(discordUserId, dto.discordUsername))) {
      throw new NotFoundException(`No link for Discord user ${discordUserId}`);
    }
  }

  async createInviteBatch(dto: DiscordInviteBatchCreateDto): Promise<DiscordInviteBatchDto> {
    const batch = await this.discord.createBatch({
      guildId: dto.guildId,
      channelId: dto.channelId,
      maxClaims: dto.maxClaims,
      createdByDiscordUserId: dto.createdByDiscordUserId,
    });
    return { id: batch.id, maxClaims: batch.maxClaims, claimed: 0 };
  }

  async setInviteBatchMessage(batchId: string, dto: DiscordInviteBatchMessageDto): Promise<void> {
    if (!(await this.discord.setBatchMessage(batchId, dto.messageId))) {
      throw new NotFoundException(`No invite batch with id ${batchId}`);
    }
  }

  async createInvite(dto: DiscordInviteCreateDto): Promise<DiscordInviteCreatedDto> {
    await this.discord.deleteExpiredRequests();
    const claim = await this.discord.claimInvite(
      dto.discordUserId,
      dto.discordUsername,
      dto.batchId ?? null,
      this.crypto.randomHex(16),
    );
    switch (claim.status) {
      case 'linked': {
        throw new ConflictException('ALREADY_LINKED');
      }
      case 'used': {
        throw new ConflictException('INVITE_USED');
      }
      case 'exhausted': {
        throw new ConflictException('BATCH_EXHAUSTED');
      }
      case 'cancelled': {
        throw new ConflictException('BATCH_CANCELLED');
      }
      case 'unknownBatch': {
        throw new NotFoundException(`No invite batch with id ${dto.batchId}`);
      }
    }
    const request = await this.discord.createRequest({
      code: this.crypto.randomHex(32),
      discordUserId: dto.discordUserId,
      discordUsername: dto.discordUsername,
      allowlistId: claim.entry.id,
      expiresAt: new Date(Date.now() + LINK_REQUEST_TTL.toMillis()),
    });
    return { code: request.code, expiresAt: request.expiresAt, remaining: claim.remaining };
  }

  async getInvite(code: string): Promise<DiscordInviteResponseDto> {
    const request = await this.getValidRequest(code);
    if (!request.allowlistId) {
      throw new NotFoundException('Unknown or expired link code');
    }
    return { discordUsername: request.discordUsername };
  }

  async getUserSummary(userId: string): Promise<DiscordUserSummaryDto> {
    const summary = await this.discord.getUserSummary(userId);
    if (!summary) {
      throw new NotFoundException(`No user with id ${userId}`);
    }
    return {
      ...summary,
      connectionCount: Number(summary.connectionCount ?? 0),
      repositoryCount: Number(summary.repositoryCount ?? 0),
    };
  }
}
