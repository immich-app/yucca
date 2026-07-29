import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { KyselyModule } from 'nestjs-kysely';
import { MeterRepository } from './repositories/meter.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { RgwFleetRepository } from './repositories/rgwFleet.repository';
import { TopologyRepository } from './repositories/topology.repository';
import { MetricsService } from './services/metrics.service';
import { getKyselyConfig } from './utils/database';

export const imports = [KyselyModule.forRoot(getKyselyConfig()), ScheduleModule.forRoot()];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  TopologyRepository,
  RgwFleetRepository,
  MeterRepository,
  RepositoryRepository,
  MetricsService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
];

@Module({
  imports: [OtelModule, ...imports],
  providers,
})
export class AppModule {}
