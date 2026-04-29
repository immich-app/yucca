import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { DeviceFlowResponseDto } from '../dto/auth.dto';
import { CookieName } from '../enum';
import { AuthService } from '../services/auth.service';

@Controller('/yucca/auth')
export class AuthController {
  constructor(readonly auth: AuthService) {}

  @Get('/oidc/device')
  @ApiOkResponse({ type: DeviceFlowResponseDto })
  oidcDeviceFlow(): Promise<DeviceFlowResponseDto> {
    return this.auth.oidcDeviceFlow();
  }

  @Get('/oidc/login')
  @ApiQuery({ name: 'next', type: String })
  async oidcAuthorize(
    @Query('next') next: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { redirectTo, state, codeVerifier } = await this.auth.oidcAuthorize(request);

    response.cookie(CookieName.NextUrl, next);
    response.cookie(CookieName.OidcState, state);
    response.cookie(CookieName.OidcCodeVerifier, codeVerifier);

    response.redirect(redirectTo);
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const { redirectTo } = await this.auth.oidcCallback(request);

    response.clearCookie(CookieName.NextUrl);
    response.clearCookie(CookieName.OidcState);
    response.clearCookie(CookieName.OidcCodeVerifier);

    response.redirect(redirectTo);
  }
}
