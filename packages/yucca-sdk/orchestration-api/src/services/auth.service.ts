import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { calculatePKCECodeChallenge, randomPKCECodeVerifier } from 'openid-client';
import { appToken } from 'yucca-api-client';
import { YUCCA_PRODUCTION_UUID } from '../const';
import { BackendType } from '../enum';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';

@Injectable()
export class AuthService {
  codeVerifier: string | undefined;
  redirectTo: string | undefined;

  constructor(
    readonly config: ConfigRepository,
    readonly backend: BackendRepository,
    @Inject(ModuleConfigProvider) readonly moduleConfig: ModuleConfig,
  ) {}

  async login(redirectTo: string): Promise<{ redirectTo: string }> {
    this.codeVerifier = randomPKCECodeVerifier();
    this.redirectTo = redirectTo;

    const codeChallenge = await calculatePKCECodeChallenge(this.codeVerifier);

    return {
      redirectTo: `${this.moduleConfig.yuccaProductionApi}/api/auth/app/login?code_challenge=${codeChallenge}`,
    };
  }

  async callback(code: string): Promise<{ redirectTo: string }> {
    if (!this.codeVerifier || !this.redirectTo) {
      throw new BadRequestException('Missing local auth state');
    }

    const { accessToken } = await appToken(
      {
        code,
        codeVerifier: this.codeVerifier,
      },
      {
        baseUrl: this.moduleConfig.yuccaProductionApi,
      },
    );

    await this.backend.updateBackend(YUCCA_PRODUCTION_UUID, {
      type: BackendType.Yucca,
      accessToken,
    });

    return {
      redirectTo: this.redirectTo,
    };
  }
}
