import { Module } from '@nestjs/common';
import { OrchestrationApiController } from './orchestration-api.controller';
import { OrchestrationApiService } from './orchestration-api.service';

@Module({
  controllers: [OrchestrationApiController],
  providers: [OrchestrationApiService],
  exports: [OrchestrationApiService],
})
export class OrchestrationApiModule {}
