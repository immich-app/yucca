import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { calculatePKCECodeChallenge, randomPKCECodeVerifier } from 'openid-client';
import { appToken } from 'yucca-api-client';
import { YuccaApiEndpointUrlProvider } from '../providers';
import { ConfigRepository } from '../repositories/config.repository';

@Injectable()
export class AuthService {
  codeVerifier: string | undefined;
  redirectTo: string | undefined;

  constructor(
    readonly config: ConfigRepository,
    @Optional() @Inject(YuccaApiEndpointUrlProvider) readonly yuccaUrl: string,
  ) {}

  async login(redirectTo: string): Promise<{ redirectTo: string }> {
    this.codeVerifier = randomPKCECodeVerifier();
    this.redirectTo = redirectTo;

    const codeChallenge = await calculatePKCECodeChallenge(this.codeVerifier);

    return {
      redirectTo: `${this.yuccaUrl ?? 'http://localhost:5173'}/api/auth/app/login?code_challenge=${codeChallenge}`,
    };
  }

  async callback(code: string): Promise<{ redirectTo: string }> {
    if (!this.codeVerifier || !this.redirectTo) {
      throw new BadRequestException('Missing local auth state');
    }

    const { accessToken } = await appToken({
      code,
      codeVerifier: this.codeVerifier,
    });

    await this.config.setAccessToken(accessToken);

    return {
      redirectTo: this.redirectTo,
    };
  }
}
