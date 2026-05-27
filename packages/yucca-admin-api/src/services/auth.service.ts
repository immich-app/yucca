import { WideContextRepository } from '@common/server/otel';
import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import { Request } from 'express';
import { IncomingHttpHeaders } from 'node:http';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { env } from 'src/env';
import { OidcRepository } from 'src/repositories/oidc.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly oidc: OidcRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    const cookies = parse(headers.cookie ?? '');
    const sub = cookies[CookieName.Sub];
    const accessToken = cookies[CookieName.AccessToken];

    if (!sub) {
      throw new UnauthorizedException(`Missing ${CookieName.Sub} cookie`);
    }

    if (!accessToken) {
      throw new UnauthorizedException(`Missing ${CookieName.AccessToken} cookie`);
    }

    const userInfo = await this.oidc.fetchUserInfo(accessToken, sub);

    if (!userInfo) {
      throw new UnauthorizedException(`Missing user info`);
    }

    this.wideContext.assignContext({ userInfo });

    return {
      sub: userInfo.sub,
    };
  }

  logout(): URL | void {
    return this.oidc.logout();
  }

  async oidcAuthorize(
    codeChallenge?: string,
    state?: string,
  ): Promise<{ redirectTo: string; state: string; codeVerifier?: string }> {
    const { redirectTo, state: newState, codeVerifier } = await this.oidc.authorize(codeChallenge, state);
    return { redirectTo: redirectTo.href, state: newState, codeVerifier };
  }

  async oidcCallback(request: Request): Promise<{ redirectTo: string; sub: string; accessToken: string }> {
    const redirectUri = new URL(env.OIDC_ADMIN_REDIRECT_URI);
    const url = new URL(`${redirectUri.origin}${request.originalUrl}`);

    const error = url.searchParams.has('error');

    if (error) {
      throw new InternalServerErrorException(`OIDC error: ${url.searchParams.get('error_description') ?? error}`);
    }

    const cookies = parse(request.headers.cookie || '');
    const { [CookieName.OidcState]: expectedState, [CookieName.OidcCodeVerifier]: codeVerifier } = cookies;

    if (!expectedState) {
      throw new InternalServerErrorException('missing expectedState');
    }

    if (!codeVerifier) {
      throw new InternalServerErrorException('missing codeVerifier');
    }

    const response = await this.oidc.callback(url, expectedState, codeVerifier);
    const claims = response.claims();
    if (!claims) {
      throw new InternalServerErrorException('no id token received');
    }

    this.wideContext.assignContext({ claims });

    return {
      redirectTo: '/',
      sub: claims.sub,
      accessToken: response.access_token,
    };
  }
}
