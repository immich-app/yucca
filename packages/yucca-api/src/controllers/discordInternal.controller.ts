import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  DiscordLinkDto,
  DiscordLinkRequestCreateDto,
  DiscordLinkRequestCreatedDto,
  DiscordUserSummaryDto,
} from 'src/dto/discord.dto';
import { InternalGuard } from 'src/middleware/internal.guard';
import { DiscordService } from 'src/services/discord.service';

@Controller('/internal/discord')
@UseGuards(InternalGuard)
@ApiExcludeController()
export class DiscordInternalController {
  constructor(private readonly discord: DiscordService) {}

  @Post('/link-requests')
  createLinkRequest(@Body() dto: DiscordLinkRequestCreateDto): Promise<DiscordLinkRequestCreatedDto> {
    return this.discord.createLinkRequest(dto);
  }

  @Get('/links/:discordUserId')
  getLink(@Param('discordUserId') discordUserId: string): Promise<DiscordLinkDto> {
    return this.discord.getLink(discordUserId);
  }

  @Get('/users/:userId/summary')
  getUserSummary(@Param('userId', ParseUUIDPipe) userId: string): Promise<DiscordUserSummaryDto> {
    return this.discord.getUserSummary(userId);
  }
}
