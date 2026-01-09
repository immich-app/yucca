import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotImplementedException,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';

const RESTIC_CONTENT_TYPE = 'application/vnd.x.restic.rest.v2';
const MetadataKey = 'RESTIC_V2';

export const ResticRoute = (): MethodDecorator => {
  return applyDecorators(SetMetadata(MetadataKey, true));
};

@Injectable()
export class ResticInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isResticV2 = this.reflector.get<boolean>(MetadataKey, context.getHandler());
    if (!isResticV2) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.headers.accept !== RESTIC_CONTENT_TYPE) {
      throw new NotImplementedException();
    }

    return next.handle().pipe(
      map((data) => {
        response.setHeader('Content-Type', RESTIC_CONTENT_TYPE);
        response.end(JSON.stringify(data));
        return void 0;
      }),
    );
  }
}
