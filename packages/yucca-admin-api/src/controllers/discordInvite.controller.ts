import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  DiscordInviteBatchCancelQueryDto,
  DiscordInviteBatchCancelResponseDto,
  DiscordInviteBatchListResponseDto,
  DiscordInviteClaimListResponseDto,
} from 'src/dto/discordInvite.dto';
import { AuthRoute } from 'src/middleware/auth.guard';
import { DiscordInviteService } from 'src/services/discordInvite.service';

@Controller('/discord-invites')
export class DiscordInviteController {
  constructor(private readonly invites: DiscordInviteService) {}

  @Get('/batches')
  @AuthRoute()
  @ApiOkResponse({ type: DiscordInviteBatchListResponseDto })
  listBatches(): Promise<DiscordInviteBatchListResponseDto> {
    return this.invites.listBatches();
  }

  @Delete('/batches/:id')
  @AuthRoute()
  @ApiOkResponse({ type: DiscordInviteBatchCancelResponseDto })
  cancelBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DiscordInviteBatchCancelQueryDto,
  ): Promise<DiscordInviteBatchCancelResponseDto> {
    return this.invites.cancelBatch(id, query.revokeUnused === 'true');
  }

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: DiscordInviteClaimListResponseDto })
  listClaims(): Promise<DiscordInviteClaimListResponseDto> {
    return this.invites.listClaims();
  }

  @Delete('/:discordUserId')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeClaim(@Param('discordUserId') discordUserId: string): Promise<void> {
    return this.invites.revokeClaim(discordUserId);
  }
}
