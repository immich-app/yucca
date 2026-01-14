import { Injectable } from '@nestjs/common';
import { LoggerRepository } from 'src/repositories/logger.repository';

@Injectable()
export class AppService {
  constructor(private readonly logger: LoggerRepository) {
    logger.setContext('AppService');
  }

  hello(): string {
    this.logger.debug('Hello, World!');
    return 'Hello, World!';
  }
}
