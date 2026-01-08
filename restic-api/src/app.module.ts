import { Module } from '@nestjs/common';
import { AppController } from './controllers/app.controller';
import { LoggerRepository } from './repositories/logger.repository';
import { StorageRepository } from './repositories/storage.repository';
import { AppService } from './services/app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [LoggerRepository, StorageRepository, AppService],
})
export class AppModule {}
