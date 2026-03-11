import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import {
  ListSnapshotsResponseDto,
  LogResponseDto,
  RepositoryCheckImportResponseDto,
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryPathRequestDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RunHistoryResponseDto,
} from '../dto/repository.dto';
import { RepositoryService } from '../services/repository.service';

@Controller('/repository')
export class RepositoryController {
  constructor(private readonly service: RepositoryService) {}

  @Post()
  @ApiQuery({ name: 'backend', type: String, required: false })
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  createRepository(
    @Body() dto: RepositoryCreateRequestDto,
    @Query('backend') backendId?: string,
  ): Promise<RepositoryCreateResponseDto> {
    return this.service.createRepository(dto, backendId);
  }

  @Get()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  getRepositories(): Promise<RepositoryListResponseDto> {
    return this.service.getRepositories();
  }

  @Patch('/:id')
  @ApiQuery({ name: 'backend', type: String, required: false })
  @ApiOkResponse({ type: RepositoryUpdateResponseDto })
  updateRepository(
    @Param('id') id: string,
    @Body() dto: RepositoryUpdateRequestDto,
    @Query('backend') backendId?: string,
  ): Promise<RepositoryUpdateResponseDto> {
    return this.service.updateRepository(id, dto, backendId);
  }

  @Post('/:id')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: LogResponseDto })
  createBackup(@Param('id') id: string): LogResponseDto {
    const { logId } = this.service.createBackup(id);
    return { logId };
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

  @Get('/:id/import')
  @ApiQuery({ name: 'backend', type: String })
  @ApiOkResponse({ type: RepositoryCheckImportResponseDto })
  checkImportRepository(@Param('id') id: string, @Query('backend') backend: string) {
    return this.service.checkImportRepository(id, backend);
  }

  @Post('/:id/import')
  @ApiQuery({ name: 'backend', type: String })
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  importRepository(@Param('id') id: string, @Query('backend') backend: string): Promise<RepositoryCreateResponseDto> {
    return this.service.importRepository(id, backend);
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

  @Sse('/logs/:id')
  @ApiParam({ name: 'id', type: String })
  logStreamSse(@Param('id') id: string): Observable<MessageEvent> {
    // TODO: move to separate controller
    return this.service.observableLog(id);
  }
}
