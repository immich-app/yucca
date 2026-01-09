import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerRepository {
  private context: string;

  setContext(context: string) {
    this.context = context;
  }

  debug(...args: any[]): void {
    console.debug(`[${this.context}]`, ...args);
  }
}
