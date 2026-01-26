import { env } from '@common/server/env';
import {
  LoggerRepository,
  LoggingInterceptor,
  OtelModule,
  shutdownOtel,
  WideContextRepository,
} from '@common/server/otel';
import { Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './controllers/app.controller';
import { AuthGuard } from './middleware/auth.guard';
import { ResticInterceptor } from './middleware/restic.interceptor';
import { StorageRepository } from './repositories/storage.repository';
import { AppService } from './services/app.service';
import { AuthService } from './services/auth.service';

@Module({
  imports: [
    OtelModule,
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
    }),
  ],
  controllers: [AppController],
  providers: [
    WideContextRepository,
    LoggerRepository,
    StorageRepository,
    AuthService,
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResticInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await shutdownOtel();
  }
}
