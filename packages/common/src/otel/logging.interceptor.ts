import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, Scope } from '@nestjs/common';
import { type Attributes, type Counter } from '@opentelemetry/api';
import { type Request } from 'express';
import { MetricService } from 'nestjs-otel';
import { randomUUID } from 'node:crypto';
import { Observable, catchError, tap } from 'rxjs';
import { otelEnv } from './env.js';
import { LoggerRepository } from './logger.repository.js';
import { WideContextRepository } from './wideContext.repository.js';

@Injectable({ scope: Scope.REQUEST })
export class LoggingInterceptor implements NestInterceptor {
  private readonly requestCount: Counter;

  constructor(
    private readonly logger: LoggerRepository,
    private readonly wideContext: WideContextRepository,
    metricService: MetricService,
  ) {
    this.requestCount = metricService.getCounter('api_request_count', {
      description: 'API requests by handler, status, and customer',
    });
  }

  // Counts every request (log lines are sampled, the counter is not). handler = Controller.method — bounded,
  // unlike the raw path which embeds resource ids. customerId/repositoryId come from wide context when authenticated.
  private recordRequest(handler: string, method: string, event: Record<string, unknown>) {
    const attributes: Attributes = { handler, method, status: event.status_code as number };
    if (typeof event.customerId === 'string') {
      attributes.customerId = event.customerId;
    }
    if (typeof event.repositoryId === 'string') {
      attributes.repositoryId = event.repositoryId;
    }
    this.requestCount.add(1, attributes);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();

    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Request>();

    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const event: Record<string, unknown> = {
      request_id: request.headers['x-request-id'] ?? randomUUID(),
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.path,
      _msg: `${request.method} ${handler}`,
    };

    return next.handle().pipe(
      tap(() => {
        event.status_code = response.statusCode || -1;
        event.outcome = 'success';
        event.duration_ms = Date.now() - startTime;
        event._msg += ' (OK)';

        this.wideContext.applyContext(event);
        this.recordRequest(handler, request.method, event);

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
        this.recordRequest(handler, request.method, event);

        this.logger.error(event);
        throw error;
      }),
    );
  }
}
