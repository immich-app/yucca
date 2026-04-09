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
import { env } from './env';
import { AuthGuard } from './middleware/auth.guard';
import { ResticInterceptor } from './middleware/restic.interceptor';
import { StorageRepository } from './repositories/storage.repository';
import { AppService } from './services/app.service';
import { AuthService } from './services/auth.service';

export const imports = [
  JwtModule.register({
    global: true,
    secret: env.JWT_SECRET,
  }),
];

export const controllers = [AppController];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  StorageRepository,
  AuthService,
  AppService,
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_INTERCEPTOR, useClass: ResticInterceptor },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
];

@Module({
  imports: [OtelModule, ...imports],
  controllers,
  providers,
})
export class AppModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await shutdownOtel();
  }
}
