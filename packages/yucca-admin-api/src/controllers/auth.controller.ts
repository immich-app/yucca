import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Duration } from 'luxon';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AuthService } from 'src/services/auth.service';

@Controller('/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: AuthDto })
  getAuth(@Auth() auth: AuthDto) {
    return auth;
  }

  @Get('/logout')
  @AuthRoute()
  logout(@Res() response: Response) {
    const url = this.auth.logout();
    response.clearCookie(CookieName.Sub);
    response.clearCookie(CookieName.AccessToken);
    response.redirect(url?.href || '/');
  }

  @Get('/oidc/login')
  @ApiQuery({ name: 'code_challenge', type: String })
  @ApiQuery({ name: 'state', type: String })
  async oidcAuthorize(
    @Query('code_challenge') codeChallenge: string,
    @Query('state') state: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { redirectTo, state: newState, codeVerifier } = await this.auth.oidcAuthorize(codeChallenge, state);

    response.cookie(CookieName.OidcState, newState);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    response.redirect(redirectTo);
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const { sub, accessToken, redirectTo } = await this.auth.oidcCallback(request);

    response.clearCookie(CookieName.OidcState);
    response.clearCookie(CookieName.OidcCodeVerifier);

    response.cookie(CookieName.Sub, sub, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ days: 7 }).toMillis(),
    });

    response.cookie(CookieName.AccessToken, accessToken, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ days: 7 }).toMillis(),
    });

    response.redirect(redirectTo);
  }
}
