import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { RepositoryCreateResponseDto, RepositoryListResponseDto, RepositoryMetadataDto } from '../dto/repository.dto';
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

  @Post('/:id')
  @ApiParam({ name: 'id', type: String })
  createBackup(@Param('id') id: string): Promise<void> {
    return this.service.createBackup(id);
  }

  @Patch('/:id')
  @ApiParam({ name: 'id', type: String })
  setRepositoryConfig(@Param('id') id: string, @Body() dto: RepositoryMetadataDto): Promise<void> {
    return this.service.setRepositoryConfig(id, dto);
  }
}
