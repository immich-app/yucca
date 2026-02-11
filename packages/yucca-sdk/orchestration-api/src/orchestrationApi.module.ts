import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller.js';
import { RepositoryController } from './controllers/repository.controller.js';
import { ConfigRepository } from './repositories/config.repository.js';
import { ResticRepository } from './repositories/restic.repository.js';
import { YuccaApiRepository } from './repositories/yuccaApi.repository.js';
import { OrchestrationApiService } from './services/orchestrationApi.service.js';
import { RepositoryService } from './services/repository.service.js';

@Module({
  controllers: [RepositoryController, AuthController],
  providers: [ConfigRepository, ResticRepository, YuccaApiRepository, RepositoryService, OrchestrationApiService],
  exports: [OrchestrationApiService],
})
export class OrchestrationApiModule {}
