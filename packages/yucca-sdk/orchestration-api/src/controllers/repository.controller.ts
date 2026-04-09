import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { FilesystemListingRequestDto, FilesystemListingResponseDto } from '../dto/filesystem.dto';
import {
  ListSnapshotsResponseDto,
  LogResponseDto,
  RepositoryCheckImportResponseDto,
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryInspectResponseDto,
  RepositoryListResponseDto,
  RepositorySnapshotRestoreFromPointRequestDto,
  RepositorySnapshotRestoreRequestDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RunHistoryResponseDto,
} from '../dto/repository.dto';
import { RepositoryService } from '../services/repository.service';

@Controller('/yucca/repository')
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

  @Get('/inspect')
  @ApiOkResponse({ type: RepositoryInspectResponseDto })
  inspectRepositories(): Promise<RepositoryInspectResponseDto> {
    return this.service.inspectRepositories();
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
  async createBackup(@Param('id') id: string): Promise<LogResponseDto> {
    const { logId } = await this.service.createBackup(id);
    return { logId };
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

  @Post('/:id/snapshots/:snapshot')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'snapshot', type: String })
  @ApiOkResponse({ type: LogResponseDto })
  async restoreSnapshot(
    @Param('id') id: string,
    @Param('snapshot') snapshotId: string,
    @Body() dto: RepositorySnapshotRestoreRequestDto,
  ): Promise<LogResponseDto> {
    return this.service.restoreSnapshot(id, snapshotId, dto);
  }

  @Post('/:id/snapshots/:snapshot/restore-from-point')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'snapshot', type: String })
  @ApiQuery({ name: 'backend', type: String })
  @ApiOkResponse({ type: LogResponseDto })
  async restoreFromPoint(
    @Param('id') id: string,
    @Param('snapshot') snapshotId: string,
    @Query('backend') backendId: string,
    @Body() dto: RepositorySnapshotRestoreFromPointRequestDto,
  ): Promise<LogResponseDto> {
    return this.service.restoreFromPoint(id, snapshotId, backendId, dto);
  }

  @Delete('/:id/snapshots/:snapshot')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'snapshot', type: String })
  @ApiOkResponse({ type: ListSnapshotsResponseDto })
  forgetSnapshot(@Param('id') id: string, @Param('snapshot') snapshot: string): Promise<void> {
    return this.service.forgetSnapshot(id, snapshot);
  }

  @Get('/:id/snapshots/:snapshot/listing')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'snapshot', type: String })
  @ApiQuery({ name: 'path', type: String, required: false })
  @ApiOkResponse({ type: FilesystemListingResponseDto })
  async getSnapshotListing(
    @Param('id') id: string,
    @Param('snapshot') snapshotId: string,
    @Query() dto: FilesystemListingRequestDto,
  ): Promise<FilesystemListingResponseDto> {
    return this.service.getSnapshotListing(id, snapshotId, dto);
  }
}
