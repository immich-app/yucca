import { Injectable, Scope } from '@nestjs/common';
import pino from 'pino';
import env from 'src/env';

@Injectable({ scope: Scope.DEFAULT })
export class LoggerRepository {
  private logger: ReturnType<typeof pino>;

  constructor() {
    this.logger = pino(
      env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
            },
          }
        : {},
    );
  }

  log(...args: Parameters<typeof this.logger.log>): void {
    this.logger.debug(...args);
  }

  debug(...args: Parameters<typeof this.logger.debug>): void {
    this.logger.debug(...args);
  }

  info(...args: Parameters<typeof this.logger.info>): void {
    this.logger.info(...args);
  }

  warn(...args: Parameters<typeof this.logger.warn>): void {
    this.logger.warn(...args);
  }

  error(...args: Parameters<typeof this.logger.error>): void {
    this.logger.error(...args);
  }
}
