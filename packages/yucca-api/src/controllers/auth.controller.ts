import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Duration } from 'luxon';
import { AppTokenRequestDto, AppTokenResponseDto, AuthDto } from 'src/dto/auth.dto';
import { CookieName, OidcLoginFlow } from 'src/enum';
import { Auth, AuthRoute, OptionalAuth } from 'src/middleware/auth.guard';
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
  async logout(@Auth() auth: AuthDto, @Res() response: Response) {
    const url = await this.auth.logout(auth);
    response.clearCookie(CookieName.AccessToken);
    response.redirect(url?.href || '/');
  }

  @Get('/oidc/login')
  async oidcAuthorize(@Res({ passthrough: true }) response: Response) {
    const { redirectTo, state, codeVerifier } = await this.auth.oidcAuthorize();

    response.cookie(CookieName.OidcState, state);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    response.redirect(redirectTo);
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const { accessToken, redirectTo } = await this.auth.oidcCallback(request);

    response.clearCookie(CookieName.OidcState);
    response.clearCookie(CookieName.OidcCodeVerifier);
    response.clearCookie(CookieName.OidcLoginFlow);
    response.cookie(CookieName.AccessToken, accessToken, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ days: 7 }).toMillis(),
    });

    response.redirect(redirectTo);
  }

  @AuthRoute()
  @OptionalAuth()
  @Get('/app/login')
  appAuthorize(
    @Req() request: Request,
    @Auth() auth: AuthDto | undefined,
    @Query('code_challenge') challenge: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.cookie(CookieName.AppCodeChallenge, challenge, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ minutes: 15 }).toMillis(),
    });

    const { redirectTo, setFlowCookie } = this.auth.appAuthorize(auth);

    if (setFlowCookie) {
      response.cookie(CookieName.OidcLoginFlow, OidcLoginFlow.App, {
        path: '/',
        sameSite: 'lax',
        httpOnly: true,
        secure: request.protocol === 'https',
        maxAge: Duration.fromObject({ minutes: 15 }).toMillis(),
      });
    }

    response.redirect(redirectTo);
  }

  @AuthRoute()
  @Post('/app/callback')
  async appCallback(@Req() request: Request, @Auth() auth: AuthDto, @Res({ passthrough: true }) response: Response) {
    const { redirectTo } = await this.auth.appCallback(auth, request.headers);
    response.redirect(redirectTo);
  }

  @Post('/app/token')
  @ApiOkResponse({ type: AppTokenResponseDto })
  appToken(@Body() dto: AppTokenRequestDto): Promise<AppTokenResponseDto> {
    return this.auth.appToken(dto);
  }
}
