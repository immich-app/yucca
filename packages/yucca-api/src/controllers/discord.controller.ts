import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import { DiscordInviteResponseDto, DiscordLinkRequestResponseDto } from 'src/dto/discord.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { DiscordService } from 'src/services/discord.service';

@Controller('/discord')
export class DiscordController {
  constructor(private readonly discord: DiscordService) {}

  @Get('/invites/:code')
  @ApiOkResponse({ type: DiscordInviteResponseDto })
  getDiscordInvite(@Param('code') code: string): Promise<DiscordInviteResponseDto> {
    return this.discord.getInvite(code);
  }

  @Get('/link-requests/:code')
  @AuthRoute()
  @ApiOkResponse({ type: DiscordLinkRequestResponseDto })
  getDiscordLinkRequest(@Param('code') code: string): Promise<DiscordLinkRequestResponseDto> {
    return this.discord.getLinkRequest(code);
  }

  @Post('/link-requests/:code/confirm')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  confirmDiscordLinkRequest(@Auth() auth: AuthDto, @Param('code') code: string): Promise<void> {
    return this.discord.confirmLinkRequest(auth, code);
  }
}
