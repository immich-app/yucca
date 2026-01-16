import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerRepository {
  private context: string;

  setContext(context: string) {
    this.context = context;
  }

  log(...args: any[]): void {
    console.log(`[${this.context}]`, ...args);
  }

  debug(...args: any[]): void {
    console.debug(`[${this.context}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[${this.context}]`, ...args);
  }

  error(...args: any[]): void {
    console.error(`[${this.context}]`, ...args);
  }
}
