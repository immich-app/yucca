import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthDto } from 'src/dto/auth.dto';
import { SubmitBackupEndRequestDto, SubmitUpdateSizeRequestDto } from 'src/dto/metrics.dto';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { MetricsService } from 'src/services/metrics.service';

@ApiTags('metrics')
@Controller('/metrics/submit')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Post('/:repositoryId/backup/start')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricBackupStart(@Auth() auth: AuthDto, @Param('repositoryId') repositoryId: string): Promise<void> {
    return this.metrics.submitBackupStart(auth, repositoryId);
  }

  @Post('/:repositoryId/backup/end')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricBackupEnd(
    @Auth() auth: AuthDto,
    @Param('repositoryId') repositoryId: string,
    @Body() dto: SubmitBackupEndRequestDto,
  ): Promise<void> {
    return this.metrics.submitBackupEnd(auth, repositoryId, dto);
  }

  @Patch('/:repositoryId/size')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricRepositorySize(
    @Auth() auth: AuthDto,
    @Param('repositoryId') repositoryId: string,
    @Body() dto: SubmitUpdateSizeRequestDto,
  ): Promise<void> {
    return this.metrics.submitRepositorySize(auth, repositoryId, dto);
  }
}
