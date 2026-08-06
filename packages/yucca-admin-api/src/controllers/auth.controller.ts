import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { parse } from 'cookie';
import { type Request, type Response } from 'express';
import { Duration } from 'luxon';
import { AuthDto, CliTokenRequestDto, CliTokenResponseDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AuthService, type CliLoginParams } from 'src/services/auth.service';

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

  // yuctl loopback login: CLI opens this with listener port, state nonce, S256 code challenge; the OIDC callback
  // redirects to 127.0.0.1:<port> with a one-time code exchanged at /auth/cli/token. CLI params ride their own
  // short-lived cookie, like state/verifier.
  @Get('/cli/login')
  @ApiQuery({ name: 'port', type: Number })
  @ApiQuery({ name: 'state', type: String })
  @ApiQuery({ name: 'code_challenge', type: String })
  async cliLogin(
    @Query('port') port: string,
    @Query('state') state: string,
    @Query('code_challenge') codeChallenge: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const params = this.auth.parseCliLoginParams(port, state, codeChallenge);

    const { redirectTo, state: oidcState, codeVerifier } = await this.auth.oidcAuthorize();

    response.cookie(CookieName.CliLogin, JSON.stringify(params), {
      maxAge: Duration.fromObject({ minutes: 10 }).toMillis(),
    });
    response.cookie(CookieName.OidcState, oidcState);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    response.redirect(redirectTo);
  }

  @Post('/cli/token')
  @ApiOkResponse({ type: CliTokenResponseDto })
  async cliToken(@Body() body: CliTokenRequestDto): Promise<CliTokenResponseDto> {
    return await this.auth.cliToken(body.code, body.codeVerifier);
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

    // CLI loopback flow: redirect to the local yuctl listener with a one-time code instead of the admin UI.
    const cliCookie = parse(request.headers.cookie ?? '')[CookieName.CliLogin];
    if (cliCookie) {
      // Re-validate: the cookie is client-controlled and its values are interpolated into the loopback redirect.
      const raw = JSON.parse(cliCookie) as CliLoginParams;
      const { port, state, codeChallenge } = this.auth.parseCliLoginParams(
        String(raw.port),
        raw.state,
        raw.codeChallenge,
      );
      const code = await this.auth.mintCliCode(sub, codeChallenge);

      response.clearCookie(CookieName.CliLogin);
      response.redirect(`http://127.0.0.1:${port}/callback?code=${encodeURIComponent(code)}&state=${state}`);
      return;
    }

    response.redirect(redirectTo);
  }
}
