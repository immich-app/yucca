import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  DiscordLinkDto,
  DiscordLinkRequestCreateDto,
  DiscordLinkRequestCreatedDto,
  DiscordLinkUsernameUpdateDto,
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

  @Patch('/links/:discordUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateLinkUsername(
    @Param('discordUserId') discordUserId: string,
    @Body() dto: DiscordLinkUsernameUpdateDto,
  ): Promise<void> {
    return this.discord.updateLinkUsername(discordUserId, dto);
  }

  @Get('/users/:userId/summary')
  getUserSummary(@Param('userId', ParseUUIDPipe) userId: string): Promise<DiscordUserSummaryDto> {
    return this.discord.getUserSummary(userId);
  }
}
