import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from 'src/env';

export const FRESHDESK_SECRET_HEADER = 'x-freshdesk-secret';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class FreshdeskWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const secret = request.headers[FRESHDESK_SECRET_HEADER];
    if (
      !env.FRESHDESK_WEBHOOK_SECRET ||
      typeof secret !== 'string' ||
      !timingSafeEqual(digest(secret), digest(env.FRESHDESK_WEBHOOK_SECRET))
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
