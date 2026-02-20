import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { parse } from 'cookie';
import { Request } from 'express';
import { YUCCA_PRODUCTION_UUID } from '../const';
import { BackendType, CookieName } from '../enum';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { OidcRepository } from '../repositories/oidc.repository';

@Injectable()
export class AuthService {
  codeVerifier: string | undefined;
  redirectTo: string | undefined;

  constructor(
    readonly config: ConfigRepository,
    readonly backend: BackendRepository,
    readonly oidc: OidcRepository,
    @Inject(ModuleConfigProvider) readonly moduleConfig: ModuleConfig,
  ) {}

  async oidcAuthorize(): Promise<{ redirectTo: string; state: string; codeVerifier: string }> {
    const { redirectTo, state, codeVerifier } = await this.oidc.authorize();
    return { redirectTo: redirectTo.href, state, codeVerifier };
  }

  async oidcCallback(request: Request): Promise<{ redirectTo: string }> {
    const url = new URL(`${request.protocol}://${request.get('Host')}${request.originalUrl}`);

    if (url.searchParams.has('error')) {
      throw new InternalServerErrorException(`OIDC callback: ${url.searchParams.get('error_description') ?? 'unc'}`);
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

    if (!response?.id_token) {
      throw new BadRequestException('authorization failed');
    }

    const claims = response.claims();

    if (!claims) {
      throw new InternalServerErrorException('missing claims');
    }

    const accessToken = /* todo */;

    await this.backend.updateBackend(YUCCA_PRODUCTION_UUID, {
      type: BackendType.Yucca,
      accessToken,
    });

    return {
      redirectTo: '/TODO',
    };
  }
}
