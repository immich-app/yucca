import { env } from '@common/server/env';
import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { KyselyModule } from 'nestjs-kysely';
import { AppController } from './controllers/app.controller';
import { AuthController } from './controllers/auth.controller';
import { AuthGuard } from './middleware/auth.guard';
import { CryptoRepository } from './repositories/crypto.repository';
import { DatabaseRepository } from './repositories/database.repository';
import { DummyRepository } from './repositories/dummy.repository';
import { OidcRepository } from './repositories/oidc.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';
import { AppService } from './services/app.service';
import { AuthService } from './services/auth.service';
import { DatabaseService } from './services/database.service';
import { getKyselyConfig } from './utils/database';

export const imports = [
  JwtModule.register({
    global: true,
    secret: env.JWT_SECRET,
  }),
  KyselyModule.forRoot(getKyselyConfig()),
];

export const controllers = [AppController, AuthController];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  DatabaseRepository,
  CryptoRepository,
  OidcRepository,
  UserRepository,
  SessionRepository,
  DummyRepository,
  DatabaseService,
  AppService,
  AuthService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  { provide: APP_GUARD, useClass: AuthGuard },
];

@Module({
  imports: [OtelModule, ...imports],
  controllers,
  providers,
})
export class AppModule {}
