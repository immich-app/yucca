import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import {
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryPathRequestDto,
  RunHistoryResponseDto,
} from '../dto/repository.dto';
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

  @Put('/:id/paths')
  @ApiParam({ name: 'id', type: String })
  addRepositoryPath(@Param('id') id: string, @Body() dto: RepositoryPathRequestDto): Promise<void> {
    return this.service.addRepositoryPath(id, dto.path);
  }

  @Delete('/:id/paths')
  @ApiParam({ name: 'id', type: String })
  removeRepositoryPath(@Param('id') id: string, @Body() dto: RepositoryPathRequestDto): Promise<void> {
    return this.service.removeRepositoryPath(id, dto.path);
  }

  @Get('/:id/runs')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: RunHistoryResponseDto })
  getRunHistory(@Param('id') id: string): Promise<RunHistoryResponseDto> {
    return this.service.getRunHistory(id);
  }
}
