import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  AllowlistAddRequestDto,
  AllowlistEntriesResponseDto,
  AllowlistEntryResponseDto,
  AllowlistInviteBatchRequestDto,
  AllowlistInviteRequestDto,
  AllowlistListQueryDto,
  AllowlistListResponseDto,
} from 'src/dto/allowlist.dto';
import { AuthRoute } from 'src/middleware/auth.guard';
import { AllowlistService } from 'src/services/allowlist.service';

@Controller('/allowlist')
export class AllowlistController {
  constructor(private readonly allowlist: AllowlistService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: AllowlistListResponseDto })
  listAllowlist(@Query() query: AllowlistListQueryDto): Promise<AllowlistListResponseDto> {
    return this.allowlist.list(query);
  }

  @Post()
  @AuthRoute()
  @ApiOkResponse({ type: AllowlistEntryResponseDto })
  addAllowlistEntry(@Body() dto: AllowlistAddRequestDto): Promise<AllowlistEntryResponseDto> {
    return this.allowlist.add(dto);
  }

  @Delete('/:email')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAllowlistEntry(@Param('email') email: string): Promise<void> {
    return this.allowlist.remove(email);
  }

  @Post('/invite')
  @AuthRoute()
  @ApiOkResponse({ type: AllowlistEntriesResponseDto })
  inviteEmails(@Body() dto: AllowlistInviteRequestDto): Promise<AllowlistEntriesResponseDto> {
    return this.allowlist.invite(dto);
  }

  @Post('/invite-batch')
  @AuthRoute()
  @ApiOkResponse({ type: AllowlistEntriesResponseDto })
  inviteBatch(@Body() dto: AllowlistInviteBatchRequestDto): Promise<AllowlistEntriesResponseDto> {
    return this.allowlist.inviteBatch(dto);
  }
}
