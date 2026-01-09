import { Test, TestingModule } from '@nestjs/testing';
import { LoggerRepository } from 'src/repositories/logger.repository';
import { StorageDevRepository } from 'src/repositories/storage.dev.repository';
import { AppService } from 'src/services/app.service';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, LoggerRepository, StorageDevRepository],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      appController.deleteBlob('', 'data', '');
    });
  });
});
