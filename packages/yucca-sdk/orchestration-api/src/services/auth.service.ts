import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { parse } from 'cookie';
import { Request } from 'express';
import { calculatePKCECodeChallenge, randomPKCECodeVerifier, randomState } from 'openid-client';
import { YUCCA_PRODUCTION_UUID } from '../const';
import { BackendType, CookieName } from '../enum';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';

@Injectable()
export class AuthService {
  constructor(
    readonly config: ConfigRepository,
    readonly backend: BackendRepository,
    @Inject(ModuleConfigProvider) readonly moduleConfig: ModuleConfig,
  ) {}

  async oidcAuthorize(request: Request): Promise<{ redirectTo: string; state: string; codeVerifier: string }> {
    const baseUrl = this.moduleConfig.externalBaseUrl ?? `${request.protocol}://${request.get('Host')}`;
    const redirectUri = new URL(`/api/yucca/auth/oidc/callback`, baseUrl);

    const state = randomState(); // non-PKCE fallback
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = new URL('/api/auth/oidc/login', this.moduleConfig.yuccaProductionApi);
    redirectTo.searchParams.set('code_challenge', codeChallenge);
    redirectTo.searchParams.set('redirect_uri', redirectUri.href);
    redirectTo.searchParams.set('state', state);

    return {
      redirectTo: redirectTo.href,
      codeVerifier,
      state,
    };
  }

  async oidcCallback(request: Request): Promise<{ redirectTo: string }> {
    const url = new URL(`${request.protocol}://${request.get('Host')}${request.originalUrl}`);

    if (url.searchParams.has('error')) {
      throw new InternalServerErrorException(`OIDC callback: ${url.searchParams.get('error_description') ?? 'unc'}`);
    }

    const cookies = parse(request.headers.cookie || '');
    const {
      [CookieName.OidcState]: expectedState,
      [CookieName.OidcCodeVerifier]: codeVerifier,
      [CookieName.NextUrl]: nextUrl,
    } = cookies;

    if (!expectedState) {
      throw new InternalServerErrorException('missing expectedState');
    }

    if (!codeVerifier) {
      throw new InternalServerErrorException('missing codeVerifier');
    }

    if (!nextUrl) {
      throw new InternalServerErrorException('missing nextUrl');
    }

    const callbackUrl = new URL('/api/auth/oidc/callback', this.moduleConfig.yuccaProductionApi);
    for (const [key, value] of url.searchParams.entries()) {
      callbackUrl.searchParams.set(key, value);
    }

    const response = await fetch(callbackUrl, {
      headers: {
        cookie: `${CookieName.YuccaOidcCodeVerifier}=${codeVerifier}; ${CookieName.YuccaOidcState}=${expectedState}`,
      },
      redirect: 'manual',
    });

    const authCookies = parse(response.headers.getSetCookie().join('; '));
    const accessToken = authCookies[CookieName.YuccaAccessToken];

    if (!accessToken) {
      throw new InternalServerErrorException('missing accessToken');
    }

    await this.backend.updateBackend(YUCCA_PRODUCTION_UUID, {
      type: BackendType.Yucca,
      accessToken,
    });

    return {
      redirectTo: nextUrl,
    };
  }
}
