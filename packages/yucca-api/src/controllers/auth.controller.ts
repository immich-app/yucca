import { Controller, Get, Query, Req, Res, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Duration } from 'luxon';
import { type Observable } from 'rxjs';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AuthService } from 'src/services/auth.service';
import { EmailNotAllowedException } from 'src/utils/exceptions';

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
  async logout(@Auth() auth: AuthDto, @Res() response: Response) {
    const url = await this.auth.logout(auth);
    response.clearCookie(CookieName.AccessToken);
    response.redirect(url?.href || '/');
  }

  @Get('/oidc/login')
  @ApiQuery({ name: 'code_challenge', type: String })
  @ApiQuery({ name: 'state', type: String })
  @ApiQuery({ name: 'invite_code', type: String, required: false })
  async oidcAuthorize(
    @Query('code_challenge') codeChallenge: string,
    @Query('state') state: string,
    @Query('invite_code') inviteCode: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { redirectTo, state: newState, codeVerifier } = await this.auth.oidcAuthorize(codeChallenge, state);

    response.cookie(CookieName.OidcState, newState);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    if (inviteCode) {
      response.cookie(CookieName.InviteCode, inviteCode, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: Duration.fromObject({ minutes: 10 }).toMillis(),
      });
    }

    response.redirect(redirectTo);
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    let result: { accessToken: string; redirectTo: string };
    try {
      result = await this.auth.oidcCallback(request);
    } catch (error) {
      response.clearCookie(CookieName.OidcState);
      response.clearCookie(CookieName.OidcCodeVerifier);
      response.clearCookie(CookieName.InviteCode);

      if (error instanceof EmailNotAllowedException) {
        response.redirect('/login/invite?error=not_allowed');
        return;
      }

      throw error;
    }

    const { accessToken, redirectTo } = result;

    response.clearCookie(CookieName.OidcState);
    response.clearCookie(CookieName.OidcCodeVerifier);
    response.clearCookie(CookieName.InviteCode);

    response.cookie(CookieName.AccessToken, accessToken, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ days: 7 }).toMillis(),
    });

    response.redirect(redirectTo);
  }

  @Sse('/oidc/device')
  oidcDeviceFlow(): Observable<MessageEvent> {
    return this.auth.oidcDeviceFlowObservable();
  }
}
