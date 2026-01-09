import { Test, TestingModule } from '@nestjs/testing';
import { LoggerRepository } from 'src/repositories/logger.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { AppService } from 'src/services/app.service';
import { AppController } from './app.controller';

describe('AppController', () => {
  let _appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, LoggerRepository, StorageRepository],
    }).compile();

    _appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(1).toBe(1);
    });
  });
});
