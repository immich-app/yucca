import { Module } from '@nestjs/common';
import { RepositoryController } from './controllers/repository.controller';
import { OrchestrationApiService } from './orchestration-api.service';
import { ConfigRepository } from './repositories/config.repository';
import { ResticRepository } from './repositories/restic.repository';
import { YuccaApiRepository } from './repositories/yuccaApi.repository';

@Module({
  controllers: [RepositoryController],
  providers: [ConfigRepository, ResticRepository, YuccaApiRepository, OrchestrationApiService],
  exports: [OrchestrationApiService],
})
export class OrchestrationApiModule {}
