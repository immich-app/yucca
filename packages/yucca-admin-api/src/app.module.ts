import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { KyselyModule } from 'nestjs-kysely';
import { AuthController } from './controllers/auth.controller';
import { RepositoryController } from './controllers/repository.controller';
import { SessionController } from './controllers/session.controller';
import { UserController } from './controllers/user.controller';
import { AuthGuard } from './middleware/auth.guard';
import { DatabaseRepository } from './repositories/database.repository';
import { OidcRepository } from './repositories/oidc.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { SessionRepository } from './repositories/session.repository';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { RepositoryService } from './services/repository.service';
import { SessionService } from './services/session.service';
import { UserService } from './services/user.service';
import { getKyselyConfig } from './utils/database';

export const imports = [KyselyModule.forRoot(getKyselyConfig())];

export const controllers = [AuthController, UserController, SessionController, RepositoryController];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  DatabaseRepository,
  OidcRepository,
  UserRepository,
  SessionRepository,
  RepositoryRepository,
  AuthService,
  UserService,
  SessionService,
  RepositoryService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  { provide: APP_GUARD, useClass: AuthGuard },
];

@Module({
  imports: [OtelModule, ...imports],
  controllers,
  providers,
})
export class AppModule {}
