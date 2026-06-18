import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import {
  RepositoryMetricsHistoryListResponseDto,
  SubmitBackupEndRequestDto,
  SubmitStructuredLogRequestDto,
  SubmitUpdateSizeRequestDto,
} from 'src/dto/metrics.dto';
import { CursorPaginationDto } from 'src/dto/pagination.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { MetricsService } from 'src/services/metrics.service';

@ApiTags('metrics')
@Controller('/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Post('/submit/:repositoryId/backup/start')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricBackupStart(@Auth() auth: AuthDto, @Param('repositoryId') repositoryId: string): Promise<void> {
    return this.metrics.submitBackupStart(auth, repositoryId);
  }

  @Post('/submit/:repositoryId/backup/end')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricBackupEnd(
    @Auth() auth: AuthDto,
    @Param('repositoryId') repositoryId: string,
    @Body() dto: SubmitBackupEndRequestDto,
  ): Promise<void> {
    return this.metrics.submitBackupEnd(auth, repositoryId, dto);
  }

  @Patch('/submit/:repositoryId/size')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricRepositorySize(
    @Auth() auth: AuthDto,
    @Param('repositoryId') repositoryId: string,
    @Body() dto: SubmitUpdateSizeRequestDto,
  ): Promise<void> {
    return this.metrics.submitRepositorySize(auth, repositoryId, dto);
  }

  @Post('/submit/log')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitStructuredLog(@Auth() auth: AuthDto, @Body() dto: SubmitStructuredLogRequestDto) {
    this.metrics.submitStructuredLog(auth, dto);
  }

  @Get('/:repositoryId/history')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryMetricsHistoryListResponseDto })
  listMetricsHistory(
    @Auth() auth: AuthDto,
    @Param('repositoryId') repositoryId: string,
    @Query() query: CursorPaginationDto,
  ): Promise<RepositoryMetricsHistoryListResponseDto> {
    return this.metrics.listHistory(auth, repositoryId, query);
  }
}
