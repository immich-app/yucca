import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { KyselyModule } from 'nestjs-kysely';
import { ConnectionMetricsRepository } from './repositories/connectionMetrics.repository';
import { MeterRepository } from './repositories/meter.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { ResticTokenRepository } from './repositories/resticToken.repository';
import { RgwRepository } from './repositories/rgw.repository';
import { MetricsService } from './services/metrics.service';
import { RevocationSyncService } from './services/revocationSync.service';
import { getKyselyConfig } from './utils/database';

export const imports = [KyselyModule.forRoot(getKyselyConfig()), ScheduleModule.forRoot()];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  RgwRepository,
  MeterRepository,
  RepositoryRepository,
  ConnectionMetricsRepository,
  ResticTokenRepository,
  MetricsService,
  RevocationSyncService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
];

@Module({
  imports: [OtelModule, ...imports],
  providers,
})
export class AppModule {}
