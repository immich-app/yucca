import { Module } from '@nestjs/common';
import { OrchestrationApiService } from './orchestration-api.service';

@Module({
  providers: [OrchestrationApiService],
  exports: [OrchestrationApiService],
})
export class OrchestrationApiModule {}
