import { Body, Controller, Delete, Get, Param, Post, Put, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  ListSnapshotsResponseDto,
  LogResponseDto,
  RepositoryCreateRequestDto,
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
  createRepository(@Body() dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    return this.service.createRepository(dto);
  }

  @Get()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  getRepositories(): Promise<RepositoryListResponseDto> {
    return this.service.getRepositories();
  }

  @Post('/:id')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: LogResponseDto })
  createBackup(@Param('id') id: string): Promise<LogResponseDto> {
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

  @Get('/:id/snapshots')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: ListSnapshotsResponseDto })
  getSnapshots(@Param('id') id: string): Promise<ListSnapshotsResponseDto> {
    return this.service.getSnapshots(id);
  }

  @Delete('/:id/snapshots/:snapshot')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'snapshot', type: String })
  @ApiOkResponse({ type: ListSnapshotsResponseDto })
  forgetSnapshot(@Param('id') id: string, @Param('snapshot') snapshot: string): Promise<void> {
    return this.service.forgetSnapshot(id, snapshot);
  }

  // todo: move to another controller?
  @Sse('/logs/:id')
  @ApiParam({ name: 'id', type: String })
  logStreamSse(@Param('id') id: string): Observable<MessageEvent> {
    return this.service.observableLog(id);
  }
}
