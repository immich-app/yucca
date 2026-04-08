import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { KyselyModule } from 'nestjs-kysely';
import { AuthController } from './controllers/auth.controller';
import { RepositoryController } from './controllers/repository.controller';
import { env } from './env';
import { AuthGuard } from './middleware/auth.guard';
import { CryptoRepository } from './repositories/crypto.repository';
import { DatabaseRepository } from './repositories/database.repository';
import { OidcRepository } from './repositories/oidc.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { ResticApiRepository } from './repositories/resticApi.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { DatabaseService } from './services/database.service';
import { RepositoryService } from './services/repository.service';
import { getKyselyConfig } from './utils/database';

export const imports = [
  JwtModule.register({
    global: true,
    secret: env.JWT_SECRET,
  }),
  KyselyModule.forRoot(getKyselyConfig()),
];

export const controllers = [AuthController, RepositoryController];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  ResticApiRepository,
  DatabaseRepository,
  CryptoRepository,
  OidcRepository,
  UserRepository,
  RepositoryRepository,
  SessionRepository,
  DatabaseService,
  RepositoryService,
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
