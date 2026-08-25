import { Injectable, NotFoundException } from '@nestjs/common';
import { Duration } from 'luxon';
import { AuthDto } from 'src/dto/auth.dto';
import {
  DiscordLinkDto,
  DiscordLinkRequestCreateDto,
  DiscordLinkRequestCreatedDto,
  DiscordLinkRequestResponseDto,
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
