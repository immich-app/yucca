import { Injectable, Logger, Scope } from '@nestjs/common';

type LogDetails = unknown[];

const CONTEXT_PREFIX = 'Yucca';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggingRepository {
  private logger: Logger;

  constructor() {
    this.logger = new Logger(CONTEXT_PREFIX);
  }

  static create(context?: string): LoggingRepository {
    const logger = new LoggingRepository();
    if (context) {
      logger.setContext(context);
    }

    return logger;
  }

  setContext(context: string): void {
    this.logger = new Logger(`${CONTEXT_PREFIX}/${context}`);
  }

  verbose(message: string, ...details: LogDetails): void {
    this.logger.verbose(message, ...details);
  }

  debug(message: string, ...details: LogDetails): void {
    this.logger.debug(message, ...details);
  }

  log(message: string, ...details: LogDetails): void {
    this.logger.log(message, ...details);
  }

  warn(message: string, ...details: LogDetails): void {
    this.logger.warn(message, ...details);
  }

  error(message: string | Error, ...details: LogDetails): void {
    this.logger.error(message, ...details);
  }

  fatal(message: string, ...details: LogDetails): void {
    this.logger.fatal(message, ...details);
  }
}
