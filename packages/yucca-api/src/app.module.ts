import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { KyselyModule } from 'nestjs-kysely';
import { AuthController } from './controllers/auth.controller';
import { ConnectionController } from './controllers/connection.controller';
import { IntrospectionController } from './controllers/introspection.controller';
import { MetaController } from './controllers/meta.controller';
import { MetricsController } from './controllers/metrics.controller';
import { RepositoryController } from './controllers/repository.controller';
import { ResticTokenController } from './controllers/resticToken.controller';
import { env } from './env';
import { AuthGuard } from './middleware/auth.guard';
import { ConnectionRepository } from './repositories/connection.repository';
import { CryptoRepository } from './repositories/crypto.repository';
import { DatabaseRepository } from './repositories/database.repository';
import { OidcRepository } from './repositories/oidc.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { RepositoryMetricsRepository } from './repositories/repositoryMetrics.repository';
import { RepositoryMetricsHistoryRepository } from './repositories/repositoryMetricsHistory.repository';
import { ResticTokenRepository } from './repositories/resticToken.repository';
import { RevocationRepository } from './repositories/revocation.repository';
import { SessionRepository } from './repositories/session.repository';
import { SettingsRepository } from './repositories/settings.repository';
import { StorageRepository } from './repositories/storage.repository';
import { TopologyRepository } from './repositories/topology.repository';
import { UserRepository } from './repositories/user.repository';
import { UserAllowlistRepository } from './repositories/userAllowlist.repository';
import { AuthService } from './services/auth.service';
import { ConnectionService } from './services/connection.service';
import { DatabaseService } from './services/database.service';
import { IntrospectionService } from './services/introspection.service';
import { MetaService } from './services/meta.service';
import { MetricsService } from './services/metrics.service';
import { RepositoryService } from './services/repository.service';
import { ResticTokenService } from './services/resticToken.service';
import { TopologyService } from './services/topology.service';
import { getKyselyConfig } from './utils/database';

export const imports = [
  JwtModule.register({
    global: true,
    privateKey: env.JWT_PRIVATE_KEY,
    signOptions: { algorithm: 'ES256', expiresIn: env.JWT_EXPIRES_IN },
  }),
  KyselyModule.forRoot(getKyselyConfig()),
];

export const controllers = [
  AuthController,
  MetaController,
  ConnectionController,
  IntrospectionController,
  MetricsController,
  RepositoryController,
  ResticTokenController,
];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  StorageRepository,
  TopologyRepository,
  SettingsRepository,
  DatabaseRepository,
  ConnectionRepository,
  CryptoRepository,
  OidcRepository,
  UserRepository,
  UserAllowlistRepository,
  RepositoryRepository,
  RepositoryMetricsRepository,
  RepositoryMetricsHistoryRepository,
  ResticTokenRepository,
  RevocationRepository,
  SessionRepository,
  ConnectionService,
  IntrospectionService,
  DatabaseService,
  MetaService,
  TopologyService,
  MetricsService,
  RepositoryService,
  ResticTokenService,
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
