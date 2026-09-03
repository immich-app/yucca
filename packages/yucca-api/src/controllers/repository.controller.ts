import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { type Request } from 'express';
import { AuthDto } from 'src/dto/auth.dto';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryCreateResticUrlDto,
  RepositoryGetResponseDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
} from 'src/dto/repository.dto';
import { TicketAction } from 'src/enum';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AuthService } from 'src/services/auth.service';
import { RepositoryService } from 'src/services/repository.service';

@Controller('/repository')
export class RepositoryController {
  constructor(
    private readonly repository: RepositoryService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  async createRepository(
    @Auth() auth: AuthDto,
    @Body() dto: RepositoryCreateRequestDto,
  ): Promise<RepositoryCreateResponseDto> {
    return {
      repository: await this.repository.create(auth, dto),
    };
  }

  @Get('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryGetResponseDto })
  async getRepository(@Auth() auth: AuthDto, @Param('id') id: string): Promise<RepositoryGetResponseDto> {
    return {
      repository: await this.repository.get(auth, id),
    };
  }

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  getRepositories(@Auth() auth: AuthDto): Promise<RepositoryListResponseDto> {
    return this.repository.getAll(auth);
  }

  @Patch('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryUpdateResponseDto })
  updateRepository(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: RepositoryUpdateRequestDto,
  ): Promise<RepositoryUpdateResponseDto> {
    return this.repository.update(auth, id, dto);
  }

  @Post('/:id/restic')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryCreateResticUrlDto })
  async createResticUrl(@Auth() auth: AuthDto, @Param('id') id: string): Promise<RepositoryCreateResticUrlDto> {
    return this.repository.createUrl(auth, id);
  }

  @Delete('/:id')
  @ApiQuery({ name: 'ticketId', type: String })
  async deleteRepository(
    @Param('id') repositoryId: string,
    @Query('ticketId') ticketId: string,
    @Req() request: Request,
  ) {
    const ticket = await this.auth.spendTicket(TicketAction.DeleteRepository, repositoryId, ticketId, request.headers);
    return this.repository.delete(ticket, repositoryId);
  }

  @Delete('/:id/worm')
  @ApiQuery({ name: 'ticketId', type: String })
  async disableWorm(@Param('id') repositoryId: string, @Query('ticketId') ticketId: string, @Req() request: Request) {
    const ticket = await this.auth.spendTicket(TicketAction.DisableWorm, repositoryId, ticketId, request.headers);
    return this.repository.disableWorm(ticket, repositoryId);
  }
}
