import { Injectable, Scope } from '@nestjs/common';
import pino from 'pino';
import { otelEnv } from './env.js';

@Injectable({ scope: Scope.DEFAULT })
export class LoggerRepository {
  private logger: ReturnType<typeof pino>;

  constructor() {
    this.logger = pino(
      otelEnv.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
            },
          }
        : {},
    );
  }

  debug(...args: Parameters<typeof this.logger.info>): void {
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
