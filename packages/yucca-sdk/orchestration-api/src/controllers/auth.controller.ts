import { Controller, Get, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { CookieName } from '../enum';
import { AuthService } from '../services/auth.service';

@Controller('/auth')
export class AuthController {
  constructor(readonly auth: AuthService) {}

  @Get('/oidc/login')
  async oidcAuthorize(@Res({ passthrough: true }) response: Response) {
    const { redirectTo, state, codeVerifier } = await this.auth.oidcAuthorize();

    response.cookie(CookieName.OidcState, state);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    response.redirect(redirectTo);
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const { redirectTo } = await this.auth.oidcCallback(request);

    response.clearCookie(CookieName.OidcState);
    response.clearCookie(CookieName.OidcCodeVerifier);

    response.redirect(redirectTo);
  }
}
