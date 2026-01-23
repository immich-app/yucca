import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import { DummyRepository } from 'src/repositories/dummy.repository';

@Injectable()
export class AppService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly dummy: DummyRepository,
  ) {}

  hello(): Promise<string> {
    this.logger.debug('Hello, World!');
    return this.dummy.get();
  }
}
