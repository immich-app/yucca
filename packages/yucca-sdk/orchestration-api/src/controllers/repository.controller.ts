import { Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from '../dto/repository.dto';
import { RepositoryService } from '../services/repository.service';

@Controller('/repository')
export class RepositoryController {
  constructor(private readonly service: RepositoryService) {}

  @Post()
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  createRepository(): Promise<RepositoryCreateResponseDto> {
    return this.service.createRepository();
  }

  @Get()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  getRepositories(): Promise<RepositoryListResponseDto> {
    return this.service.getRepositories();
  }
}
