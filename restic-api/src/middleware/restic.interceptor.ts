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
import { ContentType, MetadataKey } from 'src/enum';

export const ResticRoute = (): MethodDecorator => {
  return applyDecorators(SetMetadata(MetadataKey.Restic, true));
};

@Injectable()
export class ResticInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isResticV2 = this.reflector.get<boolean>(MetadataKey.Restic, context.getHandler());
    if (!isResticV2) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.headers.accept !== ContentType.ResticV2) {
      throw new NotImplementedException();
    }

    return next.handle().pipe(
      map((data) => {
        response.setHeader('Content-Type', ContentType.ResticV2);
        response.end(JSON.stringify(data));
        return void 0;
      }),
    );
  }
}
