import { WideContextRepository } from '@common/server/otel';
import { ForbiddenException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parse } from 'cookie';
import { Request } from 'express';
import { IncomingHttpHeaders } from 'node:http';
import { calculatePKCECodeChallenge } from 'openid-client';
import { AppTokenRequestDto, AppTokenResponseDto, AuthDto } from 'src/dto/auth.dto';
import { CookieName, OidcLoginFlow } from 'src/enum';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { OidcRepository } from 'src/repositories/oidc.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly oidc: OidcRepository,
    private readonly user: UserRepository,
    private readonly crypto: CryptoRepository,
    private readonly session: SessionRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    const cookies = parse(headers.cookie ?? '');
    const accessToken = cookies[CookieName.AccessToken];

    if (!accessToken) {
      throw new UnauthorizedException(`Missing ${CookieName.AccessToken} cookie`);
    }

    const user = await this.user.getByAccessToken(accessToken);
    if (!user) {
      throw new UnauthorizedException(`Invalid access token`);
    }

    this.wideContext.addContext('customerId', user.id);

    return user;
  }

  async logout(auth: AuthDto): Promise<URL | void> {
    const url = this.oidc.logout();
    await this.session.delete(auth.sessionId);
    return url;
  }

  async oidcAuthorize(): Promise<{ redirectTo: string; state: string; codeVerifier: string }> {
    const { redirectTo, state, codeVerifier } = await this.oidc.authorize();
    return { redirectTo: redirectTo.href, state, codeVerifier };
  }

  async oidcCallback(request: Request): Promise<{ redirectTo: string; accessToken: string }> {
    const url = new URL(`${request.protocol}://${request.get('Host')}${request.originalUrl}`);

    if (url.searchParams.has('error')) {
      throw new InternalServerErrorException(`OIDC callback: ${url.searchParams.get('error_description') ?? 'unc'}`);
    }

    const cookies = parse(request.headers.cookie || '');
    const {
      [CookieName.OidcLoginFlow]: loginFlow,
      [CookieName.OidcState]: expectedState,
      [CookieName.OidcCodeVerifier]: codeVerifier,
    } = cookies;

    if (!expectedState) {
      throw new InternalServerErrorException('missing expectedState');
    }

    if (!codeVerifier) {
      throw new InternalServerErrorException('missing codeVerifier');
    }

    const claims = await this.oidc.callback(url, expectedState, codeVerifier);

    if (!claims) {
      throw new InternalServerErrorException('no id token received');
    }

    this.wideContext.assignContext({ claims });

    if (typeof claims.name !== 'string') {
      throw new InternalServerErrorException('name is missing from claims');
    }

    if (typeof claims.email !== 'string') {
      throw new InternalServerErrorException('email is missing from claims');
    }

    let user = await this.user.getBySub(claims.sub);

    if (user) {
      await this.user.update(user.id, {
        name: claims.name,
        email: claims.email,
      });
    } else {
      user = await this.user.create({
        sub: claims.sub,
        name: claims.name,
        email: claims.email,
      });
    }

    this.wideContext.addContext('customerId', user.id);

    const accessToken = this.crypto.randomHex(32);
    await this.session.create({
      userId: user.id,
      accessToken,
    });

    return {
      redirectTo: loginFlow === OidcLoginFlow.App ? '/login/grant' : '',
      accessToken,
    };
  }

  appAuthorize(auth: AuthDto | undefined): { redirectTo: string; setFlowCookie: boolean } {
    return auth
      ? {
          redirectTo: '/login/grant',
          setFlowCookie: false,
        }
      : {
          redirectTo: '/api/auth/oidc/login',
          setFlowCookie: true,
        };
  }

  async appCallback(auth: AuthDto, headers: IncomingHttpHeaders): Promise<{ redirectTo: string }> {
    const cookies = parse(headers.cookie ?? '');

    const codeChallenge = cookies[CookieName.AppCodeChallenge];

    const redirectUrl = new URL(`http://localhost:22676/api/auth/callback`);
    redirectUrl.searchParams.set(
      'code',
      await this.jwt.signAsync({
        userId: auth.id,
        codeChallenge,
      }),
    );

    return {
      // todo: better url logic here
      redirectTo: redirectUrl.href,
    };
  }

  async appToken(dto: AppTokenRequestDto): Promise<AppTokenResponseDto> {
    const { userId, codeChallenge }: { userId: string; codeChallenge: string } = await this.jwt.verifyAsync(dto.code);

    const expectedChallenge = await calculatePKCECodeChallenge(dto.codeVerifier);
    if (expectedChallenge !== codeChallenge) {
      throw new ForbiddenException('bad PKCE');
    }

    const accessToken = this.crypto.randomHex(32);
    await this.session.create({
      userId,
      accessToken,
    });

    return {
      accessToken,
    };
  }
}
