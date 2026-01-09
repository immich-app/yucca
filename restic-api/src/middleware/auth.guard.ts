import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { type AuthDto } from 'src/dto/auth.dto';
import { AuthService } from 'src/services/auth.service';

const MetadataKey = 'AUTH';

export const AuthRoute = (options = {}): MethodDecorator => {
  return applyDecorators(SetMetadata(MetadataKey, options));
};

export interface AuthRequest extends Request {
  auth?: AuthDto;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthDto;
}

export const Auth = createParamDecorator((_, context: ExecutionContext): AuthDto => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private service: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler()];
    const options = this.reflector.getAllAndOverride<{ _emptyObject: never } | undefined>(MetadataKey, targets);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = await this.service.authenticate(request.headers);

    const path = request.params.path;
    if (path && path !== request.auth.repository) {
      throw new BadRequestException('Repository mismatch');
    }

    return true;
  }
}
