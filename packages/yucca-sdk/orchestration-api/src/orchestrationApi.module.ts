import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { DraftController } from './controllers/draft.controller';
import { FilesystemController } from './controllers/filesystem.controller';
import { RepositoryController } from './controllers/repository.controller';
import { ConfigRepository } from './repositories/config.repository';
import { ResticRepository } from './repositories/restic.repository';
import { YuccaApiRepository } from './repositories/yuccaApi.repository';
import { AuthService } from './services/auth.service';
import { OrchestrationApiService } from './services/orchestrationApi.service';
import { RepositoryService } from './services/repository.service';

@Module({
  controllers: [RepositoryController, FilesystemController, AuthController, DraftController],
  providers: [
    ConfigRepository,
    ResticRepository,
    YuccaApiRepository,
    RepositoryService,
    AuthService,
    OrchestrationApiService,
  ],
  exports: [OrchestrationApiService],
})
export class OrchestrationApiModule {}
