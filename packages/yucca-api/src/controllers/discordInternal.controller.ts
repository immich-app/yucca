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
  DiscordInviteBatchCreateDto,
  DiscordInviteBatchDto,
  DiscordInviteBatchMessageDto,
  DiscordInviteCreateDto,
  DiscordInviteCreatedDto,
  DiscordLinkDto,
  DiscordLinkRequestCreateDto,
  DiscordLinkRequestCreatedDto,
  DiscordLinkUsernameUpdateDto,
  DiscordTicketCreateDto,
  DiscordTicketDto,
  DiscordTicketListDto,
  DiscordTicketUpdateDto,
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

  @Post('/invite-batches')
  createInviteBatch(@Body() dto: DiscordInviteBatchCreateDto): Promise<DiscordInviteBatchDto> {
    return this.discord.createInviteBatch(dto);
  }

  @Patch('/invite-batches/:batchId/message')
  @HttpCode(HttpStatus.NO_CONTENT)
  setInviteBatchMessage(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body() dto: DiscordInviteBatchMessageDto,
  ): Promise<void> {
    return this.discord.setInviteBatchMessage(batchId, dto);
  }

  @Post('/invites')
  createInvite(@Body() dto: DiscordInviteCreateDto): Promise<DiscordInviteCreatedDto> {
    return this.discord.createInvite(dto);
  }

  @Get('/users/:userId/summary')
  getUserSummary(@Param('userId', ParseUUIDPipe) userId: string): Promise<DiscordUserSummaryDto> {
    return this.discord.getUserSummary(userId);
  }

  @Post('/tickets')
  createTicket(@Body() dto: DiscordTicketCreateDto): Promise<DiscordTicketDto> {
    return this.discord.createTicket(dto);
  }

  @Get('/tickets/open')
  listOpenTickets(): Promise<DiscordTicketListDto> {
    return this.discord.listOpenTickets();
  }

  @Get('/tickets/by-thread/:threadId')
  getTicketByThread(@Param('threadId') threadId: string): Promise<DiscordTicketDto> {
    return this.discord.getTicketByThread(threadId);
  }

  @Get('/tickets/by-freshdesk/:freshdeskTicketId')
  getTicketByFreshdeskId(@Param('freshdeskTicketId') freshdeskTicketId: string): Promise<DiscordTicketDto> {
    return this.discord.getTicketByFreshdeskId(freshdeskTicketId);
  }

  @Patch('/tickets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateTicket(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DiscordTicketUpdateDto): Promise<void> {
    return this.discord.updateTicket(id, dto);
  }
}
