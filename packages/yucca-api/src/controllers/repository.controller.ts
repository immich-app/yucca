import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
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
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { RepositoryService } from 'src/services/repository.service';

@Controller('/repository')
export class RepositoryController {
  constructor(private readonly repository: RepositoryService) {}

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
  @AuthRoute()
  deleteRepository(@Auth() auth: AuthDto, @Param('id') id: string) {
    return this.repository.delete(auth, id);
  }
}
