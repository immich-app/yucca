import { Injectable } from '@nestjs/common';
import { DummyRepository } from 'src/repositories/dummy.repository';
import { LoggerRepository } from 'src/repositories/logger.repository';

@Injectable()
export class AppService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly dummy: DummyRepository,
  ) {
    logger.setContext('AppService');
  }

  hello(): Promise<string> {
    this.logger.debug('Hello, World!');
    return this.dummy.get();
  }
}
