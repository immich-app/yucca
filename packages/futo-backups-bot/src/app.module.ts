import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { DiscordRepository } from './repositories/discord.repository';
import { TranscriptStorageRepository } from './repositories/transcriptStorage.repository';
import { YuccaApiRepository } from './repositories/yuccaApi.repository';
import { SupportService } from './services/support.service';
import { SweepService } from './services/sweep.service';

export const imports = [ScheduleModule.forRoot()];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  DiscordRepository,
  YuccaApiRepository,
  TranscriptStorageRepository,
  SupportService,
  SweepService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
];

@Module({
  imports: [OtelModule, ...imports],
  providers,
})
export class AppModule {}
