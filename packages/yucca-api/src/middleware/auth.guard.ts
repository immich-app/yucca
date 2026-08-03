import { FeatureFlagKey } from '@common/server';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Scope,
  SetMetadata,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthDto } from 'src/dto/auth.dto';
import { MetadataKey } from 'src/enum';
import { AuthService } from 'src/services/auth.service';

export const AuthRoute = (options = {}): MethodDecorator => {
  return applyDecorators(SetMetadata(MetadataKey.Auth, options));
};

export const RequireFeature = (flag: FeatureFlagKey): MethodDecorator => {
  return applyDecorators(SetMetadata(MetadataKey.Feature, flag));
};

export interface AuthRequest extends Request {
  auth: AuthDto;
}

export const Auth = createParamDecorator((_, context: ExecutionContext): AuthDto => {
  return context.switchToHttp().getRequest<AuthRequest>().auth;
});

@Injectable({ scope: Scope.REQUEST })
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private service: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler()];
    const options = this.reflector.getAllAndOverride<{ _emptyObject: never } | undefined>(MetadataKey.Auth, targets);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = await this.service.authenticate(request.headers);

    const feature = this.reflector.getAllAndOverride<FeatureFlagKey | undefined>(MetadataKey.Feature, targets);
    if (feature && !request.auth.features[feature]) {
      throw new ForbiddenException(`Feature '${feature}' is not enabled for this account`);
    }

    return true;
  }
}
