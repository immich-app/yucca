import { Body, Controller, Post, Req, Res, Sse } from '@nestjs/common';
import { ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { SESSION_TTL_MS } from '../const';
import { CreateSessionRequestDto, DeviceFlowEventDto } from '../dto/auth.dto';
import { CookieName } from '../enum';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';

@Controller('/yucca/auth')
export class AuthController {
  constructor(
    readonly auth: AuthService,
    readonly session: SessionService,
  ) {}

  @Sse('/oidc/device')
  @ApiOkResponse({ type: DeviceFlowEventDto })
  connectDeviceFlow() {
    return this.auth.deviceFlow(false);
  }

  @Sse('/session/device')
  @ApiOkResponse({ type: DeviceFlowEventDto })
  sessionDeviceFlow() {
    return this.auth.deviceFlow(true);
  }

  @Post('/session')
  @ApiBody({ type: CreateSessionRequestDto })
  async createSession(
    @Body() dto: CreateSessionRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.session.authenticate(dto.token);

    response.cookie(CookieName.SessionToken, dto.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: request.protocol === 'https',
      maxAge: SESSION_TTL_MS,
    });
  }
}
