import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Request } from 'express';
import { Observable, catchError, throwError } from 'rxjs';
import { TelemetryService } from '../services/telemetry.service';

@Injectable()
export class TelemetryErrorInterceptor implements NestInterceptor {
  constructor(private readonly telemetry: TelemetryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, context.getClass());
    const isYuccaRoute = typeof controllerPath === 'string' && controllerPath.replace(/^\/+/, '').startsWith('yucca');

    if (!isYuccaRoute) {
      return next.handle();
    }

    return next.handle().pipe(
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;

        if (status >= 500) {
          const request = context.switchToHttp().getRequest<Request | undefined>();

          this.telemetry.submitStructuredLog('Unhandled request error', {
            method: request?.method,
            path: request?.url,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }

        return throwError(() => error);
      }),
    );
  }
}
