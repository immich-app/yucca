import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from 'src/env';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = request.headers[INTERNAL_SECRET_HEADER];
    if (
      !env.INTERNAL_SECRET ||
      typeof secret !== 'string' ||
      !timingSafeEqual(digest(secret), digest(env.INTERNAL_SECRET))
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
