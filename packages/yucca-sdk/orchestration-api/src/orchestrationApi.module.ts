import { DynamicModule, FactoryProvider, Module, ModuleMetadata } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
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
import { IntegrationsController } from './controllers/integrations.controller';
import { OnboardingController } from './controllers/onboarding.controller';
import { RepositoryController } from './controllers/repository.controller';
import { RunHistoryController } from './controllers/runHistory.controller';
import { RunningTasksController } from './controllers/runningTasks.controller';
import { ScheduleController } from './controllers/schedule.controller';
import { EventsGateway } from './events/events.gateway';
import { TelemetryErrorInterceptor } from './interceptors/telemetry-error.interceptor';
import { type ModuleConfig, ModuleConfigProvider } from './moduleConfig';
import { BackendRepository } from './repositories/backend.repository';
import { BootstrapRepository } from './repositories/bootstrap.repository';
import { ConfigRepository } from './repositories/config.repository';
import { DatabaseRepository } from './repositories/database.repository';
import { ModuleConfigRepository } from './repositories/moduleConfig.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { RepositoryIntegrationImmichRepository } from './repositories/repositoryIntegrationImmich.repository';
import { RepositoryLocalMetricsRepository } from './repositories/repositoryLocalMetrics.repository';
import { RepositoryPathRepository } from './repositories/repositoryPath.repository';
import { ResticRepository } from './repositories/restic.repository';
import { RunHistoryRepository } from './repositories/runHistory.repository';
import { RunningTasksRepository } from './repositories/runningTasks.repository';
import { ScheduleRepository } from './repositories/schedule.repository';
import { StorageRepository } from './repositories/storage.repository';
import { AuthService } from './services/auth.service';
import { BackendService } from './services/backend.service';
import { BootstrapService } from './services/bootstrap.service';
import { DevelopmentService } from './services/development.service';
import { FilesystemService } from './services/filesystem.service';
import { IntegrationsService } from './services/integrations.service';
import { OnboardingService } from './services/onboarding.service';
import { RepositoryService } from './services/repository.service';
import { RunHistoryService } from './services/runHistory.service';
import { RunningTasksService } from './services/runningTasks.service';
import { ScheduleService } from './services/schedule.service';
import { TelemetryService } from './services/telemetry.service';

export const controllers = [
  AuthController,
  BackendController,
  DevelopmentController,
  FilesystemController,
  IntegrationsController,
  OnboardingController,
  RepositoryController,
  RunHistoryController,
  RunningTasksController,
  ScheduleController,
];

export const repositories = [
  BackendRepository,
  BootstrapRepository,
  ConfigRepository,
  DatabaseRepository,
  ModuleConfigRepository,
  RepositoryRepository,
  RepositoryIntegrationImmichRepository,
  RepositoryLocalMetricsRepository,
  RepositoryPathRepository,
  ResticRepository,
  RunHistoryRepository,
  RunningTasksRepository,
  ScheduleRepository,
  StorageRepository,
];

export const services = [
  AuthService,
  BackendService,
  BootstrapService,
  DevelopmentService,
  FilesystemService,
  IntegrationsService,
  OnboardingService,
  RepositoryService,
  RunHistoryService,
  RunningTasksService,
  ScheduleService,
  TelemetryService,
];

export interface OrchestrationApiModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject'];
  useFactory: (...args: any[]) => Promise<Partial<ModuleConfig>> | Partial<ModuleConfig>;
}

@Module({})
class OrchestrationConfigModule {
  static forRootAsync(options: OrchestrationApiModuleAsyncOptions): DynamicModule {
    return {
      module: OrchestrationConfigModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: ModuleConfigProvider,
          inject: options.inject ?? [],
          useFactory: async (...args: any[]): Promise<ModuleConfig> => {
            const config = await options.useFactory(...args);
            config.statePath ??= resolve(homedir(), '.yucca');
            return config as ModuleConfig;
          },
        },
      ],
      exports: [ModuleConfigProvider],
    };
  }
}

@Module({})
export class OrchestrationApiModule {
  static forRootAsync(options: OrchestrationApiModuleAsyncOptions): DynamicModule {
    const configModule = OrchestrationConfigModule.forRootAsync(options);

    return {
      module: OrchestrationApiModule,
      imports: [
        configModule,
        KyselyModule.forRootAsync({
          namespace: 'orchestrator',
          imports: [configModule],
          inject: [ModuleConfigProvider],
          useFactory: (config: ModuleConfig) => {
            if (!existsSync(config.statePath)) {
              mkdirSync(config.statePath, { recursive: true });
            }

            const database = new Database(resolve(config.statePath, 'state.sqlite3'));
            database.pragma('journal_mode = WAL');

            return {
              dialect: new SqliteDialect({ database }),
            };
          },
        }),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
      ],
      controllers,
      providers: [
        { provide: APP_INTERCEPTOR, useClass: TelemetryErrorInterceptor },
        EventsGateway,
        ...repositories,
        ...services,
      ],
      exports: [EventsGateway, ModuleConfigRepository],
    };
  }
}
