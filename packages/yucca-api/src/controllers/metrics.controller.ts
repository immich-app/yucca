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

  @Post('/:id/backup/end')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricBackupEnd(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: SubmitBackupEndRequestDto,
  ): Promise<void> {
    return this.metrics.submitBackupEnd(auth, id, dto);
  }

  @Patch('/:id/size')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  submitMetricRepositorySize(
    @Auth() auth: AuthDto,
    @Param('id') id: string,
    @Body() dto: SubmitUpdateSizeRequestDto,
  ): Promise<void> {
    return this.metrics.submitRepositorySize(auth, id, dto);
  }
}
