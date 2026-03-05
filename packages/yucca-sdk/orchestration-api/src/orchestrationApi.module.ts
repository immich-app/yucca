import { DynamicModule, Module } from '@nestjs/common';
import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import { KyselyModule } from 'nestjs-kysely';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { AuthController } from './controllers/auth.controller';
import { BackendController } from './controllers/backend.controller';
import { DevelopmentController } from './controllers/development.controller';
import { FilesystemController } from './controllers/filesystem.controller';
import { OnboardingController } from './controllers/onboarding.controller';
import { RepositoryController } from './controllers/repository.controller';
import { EventsGateway } from './events/events.gateway';
import { type ModuleConfig, ModuleConfigProvider } from './moduleConfig';
import { BackendRepository } from './repositories/backend.repository';
import { ConfigRepository } from './repositories/config.repository';
import { DatabaseRepository } from './repositories/database.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { RepositoryLocalMetricsRepository } from './repositories/repositoryLocalMetrics.repository';
import { RepositoryPathRepository } from './repositories/repositoryPath.repository';
import { ResticRepository } from './repositories/restic.repository';
import { RunHistoryRepository } from './repositories/runHistory.repository';
import { RunningTasksRepository } from './repositories/runningTasks.repository';
import { AuthService } from './services/auth.service';
import { BackendService } from './services/backend.service';
import { DatabaseService } from './services/database.service';
import { OnboardingService } from './services/onboarding.service';
import { OrchestrationApiService } from './services/orchestrationApi.service';
import { RepositoryService } from './services/repository.service';

@Module({})
export class OrchestrationApiModule {
  static forRoot(config: Partial<ModuleConfig> & Pick<ModuleConfig, 'yuccaProductionApi'>): DynamicModule {
    config.statePath ??= resolve(homedir(), '.yucca');

    if (!config.yuccaProductionApi) {
      throw new Error('config.yuccaProductionApi is missing');
    }

    if (!existsSync(config.statePath)) {
      mkdirSync(config.statePath, { recursive: true });
    }

    const database = new Database(resolve(config.statePath, 'state.sqlite3'));
    database.pragma('journal_mode = WAL');

    return {
      module: OrchestrationApiModule,
      imports: [
        KyselyModule.forRoot({
          dialect: new SqliteDialect({
            database,
          }),
        }),
      ],
      controllers: [
        DevelopmentController,
        RepositoryController,
        BackendController,
        FilesystemController,
        AuthController,
        OnboardingController,
      ],
      providers: [
        { provide: ModuleConfigProvider, useValue: config },
        EventsGateway,
        RunningTasksRepository,
        DatabaseRepository,
        BackendRepository,
        ConfigRepository,
        ResticRepository,
        RunHistoryRepository,
        RepositoryRepository,
        RepositoryPathRepository,
        RepositoryLocalMetricsRepository,
        DatabaseService,
        BackendService,
        RepositoryService,
        AuthService,
        OnboardingService,
      ],
      exports: [OrchestrationApiService],
    };
  }
}
