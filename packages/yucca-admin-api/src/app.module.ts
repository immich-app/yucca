import { LoggerRepository, LoggingInterceptor, OtelModule, WideContextRepository } from '@common/server/otel';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { KyselyModule } from 'nestjs-kysely';
import { createPublicKey } from 'node:crypto';
import { AllowlistController } from './controllers/allowlist.controller';
import { AuthController } from './controllers/auth.controller';
import { FeaturesController } from './controllers/features.controller';
import { RepositoryController } from './controllers/repository.controller';
import { SessionController } from './controllers/session.controller';
import { SettingsController } from './controllers/settings.controller';
import { UserController } from './controllers/user.controller';
import { env } from './env';
import { AuthGuard } from './middleware/auth.guard';
import { DatabaseRepository } from './repositories/database.repository';
import { FeatureFlagRepository } from './repositories/featureFlag.repository';
import { OidcRepository } from './repositories/oidc.repository';
import { RepositoryRepository } from './repositories/repository.repository';
import { SessionRepository } from './repositories/session.repository';
import { SettingsRepository } from './repositories/settings.repository';
import { StorageRepository } from './repositories/storage.repository';
import { TopologyRepository } from './repositories/topology.repository';
import { UserRepository } from './repositories/user.repository';
import { UserAllowlistRepository } from './repositories/userAllowlist.repository';
import { AllowlistService } from './services/allowlist.service';
import { AuthService } from './services/auth.service';
import { DatabaseService } from './services/database.service';
import { FeaturesService } from './services/features.service';
import { RepositoryService } from './services/repository.service';
import { SessionService } from './services/session.service';
import { SettingsService } from './services/settings.service';
import { TopologyService } from './services/topology.service';
import { UserService } from './services/user.service';
import { getKyselyConfig } from './utils/database';

export const imports = [
  JwtModule.register({
    global: true,
    privateKey: env.JWT_PRIVATE_KEY,
    // Verification key derived from the signing key: CLI session JWTs are
    // minted and validated by this same service.
    publicKey: createPublicKey(env.JWT_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString(),
    signOptions: { algorithm: 'ES256', expiresIn: env.JWT_EXPIRES_IN },
    verifyOptions: { algorithms: ['ES256'] },
  }),
  KyselyModule.forRoot(getKyselyConfig()),
];

export const controllers = [
  AuthController,
  UserController,
  SessionController,
  RepositoryController,
  AllowlistController,
  SettingsController,
  FeaturesController,
];

export const providers = [
  WideContextRepository,
  LoggerRepository,
  DatabaseRepository,
  DatabaseService,
  OidcRepository,
  UserRepository,
  UserAllowlistRepository,
  SessionRepository,
  RepositoryRepository,
  SettingsRepository,
  StorageRepository,
  TopologyRepository,
  FeatureFlagRepository,
  AllowlistService,
  AuthService,
  UserService,
  SessionService,
  SettingsService,
  TopologyService,
  RepositoryService,
  FeaturesService,
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  { provide: APP_GUARD, useClass: AuthGuard },
];

@Module({
  imports: [OtelModule, ...imports],
  controllers,
  providers,
})
export class AppModule {}
