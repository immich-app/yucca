import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type IncomingHttpHeaders } from 'node:http';
import { AuthDto } from 'src/dto/auth.dto';
import { contextFromAuth } from 'src/utils/meters';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly wideContext: WideContextRepository,
  ) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    if (!headers.authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    if (!headers.authorization.startsWith('Basic ')) {
      throw new UnauthorizedException('Expected Basic auth');
    }

    const auth = Buffer.from(headers.authorization.split(' ').pop() || '', 'base64').toString();
    const [_, token] = auth.split(':');

    if (!token) {
      throw new UnauthorizedException('Expected Basic auth token');
    }

    let jwt;
    try {
      jwt = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid JWT Token');
    }

    const result = AuthDto.schema.safeParse(jwt);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    }

    this.wideContext.assignContext(contextFromAuth(result.data));
    return result.data;
  }
}
