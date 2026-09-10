import {
  LoggerRepository,
  LoggingInterceptor,
  OtelModule,
  shutdownOtel,
  WideContextRepository,
} from '@common/server/otel';
import { Module, type OnApplicationShutdown, Provider } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
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
    publicKey: env.JWT_PUBLIC_KEY,
    verifyOptions: { algorithms: ['ES256'] },
  }),
];

export const controllers = [AppController];

export const providers: Provider[] = [
  WideContextRepository,
  LoggerRepository,
  StorageRepository,
  AuthService,
  AppService,
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_INTERCEPTOR, useClass: ResticInterceptor },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  { provide: APP_PIPE, useClass: ZodValidationPipe },
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
