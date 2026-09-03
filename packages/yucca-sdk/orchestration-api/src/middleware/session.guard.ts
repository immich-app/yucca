import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { MetadataKey } from '../enum';
import { Session, SessionService } from '../services/session.service';

export const PublicRoute = (): MethodDecorator => SetMetadata(MetadataKey.PublicRoute, true);

export interface SessionRequest extends Request {
  session?: Session;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly session: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const configuration = await this.session.cloudConfiguration();
    request.session = await this.session.fromCookieHeader(request.headers.cookie, configuration);

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(MetadataKey.PublicRoute, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || !this.session.isRequired(configuration)) {
      return true;
    }

    if (!request.session) {
      throw new UnauthorizedException('Log in to FUTO Backups to manage this instance');
    }

    return true;
  }
}
