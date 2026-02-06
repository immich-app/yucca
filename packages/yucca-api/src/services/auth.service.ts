import { WideContextRepository } from '@common/server/otel';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import { Request } from 'express';
import { IncomingHttpHeaders } from 'node:http';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { OidcRepository } from 'src/repositories/oidc.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class AuthService {
  constructor(
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

  async oidcCallback(request: Request) {
    const url = new URL(`${request.protocol}://${request.get('Host')}${request.originalUrl}`);

    if (url.searchParams.has('error')) {
      throw new Error(`OIDC callback: ${url.searchParams.get('error_description') ?? 'unc'}`);
    }

    const cookies = parse(request.headers.cookie || '');
    const { [CookieName.OidcState]: expectedState, [CookieName.OidcCodeVerifier]: codeVerifier } = cookies;

    if (!expectedState) {
      throw new Error('missing expectedState');
    }

    if (!codeVerifier) {
      throw new Error('missing codeVerifier');
    }

    const claims = await this.oidc.callback(url, expectedState, codeVerifier);

    if (!claims) {
      throw new Error('no id token received');
    }

    this.wideContext.assignContext({ claims });

    if (typeof claims.name !== 'string') {
      throw new TypeError('name is missing from claims');
    }

    if (typeof claims.email !== 'string') {
      throw new TypeError('email is missing from claims');
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

    return { accessToken };
  }
}
