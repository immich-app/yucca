import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { KyselyModule } from 'nestjs-kysely';
import { AppController } from './controllers/app.controller';
import { DatabaseRepository } from './repositories/database.repository';
import { DummyRepository } from './repositories/dummy.repository';
import { LoggerRepository } from './repositories/logger.repository';
import { AppService } from './services/app.service';
import { DatabaseService } from './services/database.service';
import { getKyselyConfig } from './utils/database';
import env from '@common/server/env';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
    }),
    KyselyModule.forRoot(getKyselyConfig()),
  ],
  controllers: [AppController],
  providers: [LoggerRepository, DatabaseRepository, DummyRepository, DatabaseService, AppService],
})
export class AppModule {}
