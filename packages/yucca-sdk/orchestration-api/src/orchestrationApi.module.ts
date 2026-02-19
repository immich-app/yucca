import { Module } from '@nestjs/common';
import { RepositoryController } from './controllers/repository.controller';
import { ConfigRepository } from './repositories/config.repository';
import { ResticRepository } from './repositories/restic.repository';
import { YuccaApiRepository } from './repositories/yuccaApi.repository';
import { OrchestrationApiService } from './services/orchestrationApi.service';
import { RepositoryService } from './services/repository.service';

@Module({
  controllers: [RepositoryController],
  providers: [ConfigRepository, ResticRepository, YuccaApiRepository, RepositoryService, OrchestrationApiService],
  exports: [OrchestrationApiService],
})
export class OrchestrationApiModule {}
