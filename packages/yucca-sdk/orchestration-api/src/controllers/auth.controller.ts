import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { type Response } from 'express';
import { calculatePKCECodeChallenge, randomPKCECodeVerifier } from 'openid-client';
import { ConfigRepository } from '../repositories/config.repository.js';
import { appToken } from 'yucca-api-client';

@Controller('/auth')
export class AuthController {
  codeVerifier: string | undefined;

  constructor(readonly config: ConfigRepository) {}

  // http://localhost:22676/api/auth/login
  @Get('login')
  async login(@Res() response: Response) {
    // point to prod
    this.codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(this.codeVerifier);
    response.redirect('http://localhost:5173/api/auth/app/login?code_challenge=' + codeChallenge);
  }

  @Get('callback')
  @ApiOkResponse({ type: Object })
  async callback(@Query('code') code: string, @Res() response: Response) {
    const { accessToken } = await appToken({
      code,
      codeVerifier: this.codeVerifier!,
    });

    await this.config.setAccessToken(accessToken);

    // todo: just push us back to the test UI for now
    response.redirect('http://localhost:5174');
  }
}
