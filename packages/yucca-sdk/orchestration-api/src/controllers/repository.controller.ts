import { Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { ConfigRepository } from 'src/repositories/config.repository';
import { YuccaApiRepository } from 'src/repositories/yuccaApi.repository';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';

@Controller('/repository')
export class RepositoryController {
  constructor(
    private readonly config: ConfigRepository,
    private readonly yucca: YuccaApiRepository,
  ) {}

  @Post()
  @ApiOkResponse({ type: Object })
  createRepository(): Promise<RepositoryCreateResponseDto> {
    return this.yucca.createRepository(this.config.getAccessToken(), false);
  }

  @Get()
  @ApiOkResponse({ type: Object })
  getRepositories(): Promise<RepositoryListResponseDto> {
    return this.yucca.getRepositories(this.config.getAccessToken());
  }
}
