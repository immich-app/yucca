import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { OpenTelemetryModule } from 'nestjs-otel';
import { AppController } from './controllers/app.controller';
import env from './env';
import { AuthGuard } from './middleware/auth.guard';
import { LoggingInterceptor } from './middleware/logging.interceptor';
import { ResticInterceptor } from './middleware/restic.interceptor';
import { LoggerRepository } from './repositories/logger.repository';
import { StorageRepository } from './repositories/storage.repository';
import { AppService } from './services/app.service';
import { AuthService } from './services/auth.service';

@Module({
  imports: [
    OpenTelemetryModule.forRoot({
      metrics: {
        hostMetrics: false,
      },
    }),
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
    }),
  ],
  controllers: [AppController],
  providers: [
    LoggerRepository,
    StorageRepository,
    AuthService,
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResticInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
