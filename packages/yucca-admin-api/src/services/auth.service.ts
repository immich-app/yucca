import { WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parse } from 'cookie';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { IncomingHttpHeaders } from 'node:http';
import { AuthDto, CliTokenResponseDto } from 'src/dto/auth.dto';
import { CookieName, JwtAudience } from 'src/enum';
import { env } from 'src/env';
import { OidcRepository } from 'src/repositories/oidc.repository';

// Loopback-flow params set by the CLI on /auth/cli/login, carried through the OIDC dance in the CliLogin cookie.
export interface CliLoginParams {
  port: number;
  state: string;
  codeChallenge: string;
}

// CLI-generated state/code_challenge: constrain to URL-safe base64 so they can be echoed into the redirect untouched.
const URL_SAFE = /^[\w-]{16,128}$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly oidc: OidcRepository,
    private readonly jwt: JwtService,
    private readonly wideContext: WideContextRepository,
  ) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    const bearer = headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (bearer) {
      return await this.authenticateCli(bearer);
    }

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

  private async authenticateCli(token: string): Promise<AuthDto> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, { audience: JwtAudience.Cli });
    } catch {
      throw new UnauthorizedException('Invalid CLI session token');
    }

    this.wideContext.assignContext({ cliSub: payload.sub });

    return { sub: payload.sub };
  }

  // Validates the loopback-flow query params of GET /auth/cli/login.
  parseCliLoginParams(port?: string, state?: string, codeChallenge?: string): CliLoginParams {
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65_535) {
      throw new BadRequestException('port must be an integer in [1024, 65535]');
    }
    if (!state || !URL_SAFE.test(state)) {
      throw new BadRequestException('state must be 16-128 URL-safe base64 characters');
    }
    if (!codeChallenge || !URL_SAFE.test(codeChallenge)) {
      throw new BadRequestException('code_challenge must be 16-128 URL-safe base64 characters');
    }
    return { port: portNum, state, codeChallenge };
  }

  // One-time code for the CLI's loopback listener: short-lived JWT binding sub to the CLI's code_challenge. Single
  // use is enforced by PKCE semantics, not server state — the code is useless without the verifier, which never
  // leaves the CLI.
  async mintCliCode(sub: string, codeChallenge: string): Promise<string> {
    return await this.jwt.signAsync({ sub, cnf: codeChallenge }, { audience: JwtAudience.CliCode, expiresIn: '60s' });
  }

  async cliToken(code: string, codeVerifier: string): Promise<CliTokenResponseDto> {
    let payload: { sub: string; cnf: string };
    try {
      payload = await this.jwt.verifyAsync(code, { audience: JwtAudience.CliCode });
    } catch {
      throw new UnauthorizedException('Invalid or expired CLI login code');
    }

    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    if (challenge !== payload.cnf) {
      throw new UnauthorizedException('code_verifier does not match code_challenge');
    }

    const accessToken = await this.jwt.signAsync({ sub: payload.sub }, { audience: JwtAudience.Cli });
    const { exp } = this.jwt.decode<{ exp: number }>(accessToken);

    this.wideContext.assignContext({ cliSub: payload.sub });

    return { accessToken, expiresAt: new Date(exp * 1000).toISOString(), sub: payload.sub };
  }
}
