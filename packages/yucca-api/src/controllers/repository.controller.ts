import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import {
  RepositoryCreateResponseDto,
  RepositoryCreateResticUrlDto,
  RepositoryListResponseDto,
} from 'src/dto/repository.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { RepositoryService } from 'src/services/repository.service';

@Controller('/repository')
export class RepositoryController {
  constructor(private readonly repository: RepositoryService) {}

  @Post()
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  createRepository(@Auth() auth: AuthDto): Promise<RepositoryCreateResponseDto> {
    return this.repository.create(auth, false);
  }

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  getRepositories(@Auth() auth: AuthDto): Promise<RepositoryListResponseDto> {
    return this.repository.getAll(auth);
  }

  @Post('/:id/restic')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryCreateResticUrlDto })
  async createResticUrl(@Auth() auth: AuthDto, @Param('id') id: string): Promise<RepositoryCreateResticUrlDto> {
    return this.repository.createUrl(auth, id);
  }
}
