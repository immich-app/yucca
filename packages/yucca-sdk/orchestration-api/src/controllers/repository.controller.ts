import { Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { RepositoryService } from 'src/services/repository.service';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';

@Controller('/repository')
export class RepositoryController {
  constructor(private readonly service: RepositoryService) {}

  @Post()
  @ApiOkResponse({ type: Object })
  createRepository(): Promise<RepositoryCreateResponseDto> {
    return this.service.createRepository();
  }

  @Get()
  @ApiOkResponse({ type: Object })
  getRepositories(): Promise<RepositoryListResponseDto> {
    return this.service.getRepositories();
  }
}
