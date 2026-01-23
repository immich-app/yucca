import { env } from '@common/server/env';
import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { KyselyModule } from 'nestjs-kysely';
import { AppController } from './controllers/app.controller';
import { DatabaseRepository } from './repositories/database.repository';
import { DummyRepository } from './repositories/dummy.repository';
import { AppService } from './services/app.service';
import { DatabaseService } from './services/database.service';
import { getKyselyConfig } from './utils/database';

@Module({
  imports: [
    OtelModule,
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
    }),
    KyselyModule.forRoot(getKyselyConfig()),
  ],
  controllers: [AppController],
  providers: [
    WideContextRepository,
    LoggerRepository,
    DatabaseRepository,
    DummyRepository,
    DatabaseService,
    AppService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
