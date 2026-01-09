import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type IncomingHttpHeaders } from 'node:http';
import { type AuthDto } from 'src/dto/auth.dto';

const BASIC_CONSTANT = 'Basic ';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    if (!headers.authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    if (!headers.authorization.startsWith(BASIC_CONSTANT)) {
      throw new UnauthorizedException('Expected Basic auth');
    }

    try {
      const auth = Buffer.from(headers.authorization.slice(BASIC_CONSTANT.length), 'base64').toString();
      const [_, token] = auth.split(':');

      if (!token) {
        throw new UnauthorizedException('Expected Basic auth token');
      }

      try {
        return await this.jwt.verifyAsync(token);
      } catch {
        throw new UnauthorizedException('Invalid JWT Token');
      }
    } catch {
      throw new UnauthorizedException('Invalid Basic auth');
    }
  }
}
