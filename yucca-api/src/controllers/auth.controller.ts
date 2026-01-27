import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Duration } from 'luxon';
import { AuthDto, OidcAuthorizeDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AuthService } from 'src/services/auth.service';

@Controller('/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('/logout')
  @AuthRoute()
  async logout(@Auth() auth: AuthDto, @Res() response: Response) {
    const url = await this.auth.logout(auth);
    response.clearCookie(CookieName.AccessToken);
    response.redirect(url?.href || '/');
  }

  @Get('/oidc/login')
  @ApiOkResponse({ type: OidcAuthorizeDto })
  async oidcAuthorize(@Res({ passthrough: true }) response: Response): Promise<OidcAuthorizeDto> {
    const { redirectTo, state, codeVerifier } = await this.auth.oidcAuthorize();

    response.cookie(CookieName.OidcState, state);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    return { redirectTo };
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const { accessToken } = await this.auth.oidcCallback(request);

    response.clearCookie(CookieName.OidcState);
    response.clearCookie(CookieName.OidcCodeVerifier);
    response.cookie(CookieName.AccessToken, accessToken, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ days: 7 }).toMillis(),
    });

    response.redirect('/');
  }
}
