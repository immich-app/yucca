import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { InternalController } from './controllers/internal.controller';
import { WebhookController } from './controllers/webhook.controller';
import { DiscordRepository } from './repositories/discord.repository';
import { FreshdeskRepository } from './repositories/freshdesk.repository';
import { TranscriptStorageRepository } from './repositories/transcriptStorage.repository';
import { YuccaApiRepository } from './repositories/yuccaApi.repository';
import { FreshdeskSyncService } from './services/freshdeskSync.service';
import { InviteService } from './services/invite.service';
import { SupportService } from './services/support.service';
import { SweepService } from './services/sweep.service';

export const imports = [ScheduleModule.forRoot()];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  DiscordRepository,
  YuccaApiRepository,
  FreshdeskRepository,
  TranscriptStorageRepository,
  FreshdeskSyncService,
  InviteService,
  SupportService,
  SweepService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
];

@Module({
  imports: [OtelModule, ...imports],
  controllers: [InternalController, WebhookController],
  providers,
})
export class AppModule {}
