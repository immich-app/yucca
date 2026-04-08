import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, Scope } from '@nestjs/common';
import { type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, tap } from 'rxjs';
import { otelEnv } from './env.js';
import { LoggerRepository } from './logger.repository.js';
import { WideContextRepository } from './wideContext.repository.js';

@Injectable({ scope: Scope.REQUEST })
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();

    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Request>();

    const event: Record<string, unknown> = {
      request_id: request.headers['x-request-id'] ?? randomUUID(),
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.path,
      _msg: `${request.method} ${context.getClass().name}.${context.getHandler().name}`,
    };

    return next.handle().pipe(
      tap(() => {
        event.status_code = response.statusCode || -1;
        event.outcome = 'success';
        event.duration_ms = Date.now() - startTime;
        event._msg += ' (OK)';

        this.wideContext.applyContext(event);

        if ((event.duration_ms as number) > 500) {
          event._msg = '[SLOW] ' + event._msg;
          this.logger.warn(event);
        } else if (otelEnv.NODE_ENV === 'development' || Math.random() < otelEnv.OTEL_SAMPLE_RATE) {
          this.logger.info(event);
        }
      }),
      catchError((error) => {
        event.status_code = error.status ?? 500;
        event.outcome = 'error';
        event.error ??= {
          type: error.name,
          message: error.message,
          code: error.code,
          cause: error.cause,
          retriable: error.retriable ?? false,
        } as never;
        event.duration_ms = Date.now() - startTime;
        event._msg += ` (ERROR ${error.name})`;

        this.wideContext.applyContext(event);

        this.logger.error(event);
        throw error;
      }),
    );
  }
}
