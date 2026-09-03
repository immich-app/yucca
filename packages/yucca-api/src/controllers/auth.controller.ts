import { Body, Controller, Get, Param, Post, Query, Req, Res, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Duration } from 'luxon';
import { type Observable } from 'rxjs';
import { AuthDto, DeviceFlowEventDto } from 'src/dto/auth.dto';
import { TicketCreateRequestDto, TicketCreateResponseDto, TicketDto } from 'src/dto/ticket.dto';
import { CookieName } from 'src/enum';
import { env } from 'src/env';
import { Auth, AuthRoute } from 'src/middleware/auth.guard';
import { AuthService } from 'src/services/auth.service';
import { EmailNotAllowedException } from 'src/utils/exceptions';
import { isInAppPath } from 'src/utils/redirect';

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
  @ApiQuery({ name: 'discord_invite', type: String, required: false, description: 'Discord beta-invite token' })
  @ApiQuery({ name: 'redirect', type: String, required: false, description: 'In-app path to land on after login' })
  async oidcAuthorize(
    @Query('code_challenge') codeChallenge: string,
    @Query('state') state: string,
    @Query('invite_code') inviteCode: string | undefined,
    @Query('discord_invite') discordInvite: string | undefined,
    @Query('redirect') redirect: string | undefined,
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

    if (discordInvite) {
      response.cookie(CookieName.DiscordInvite, discordInvite, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: Duration.fromObject({ minutes: 10 }).toMillis(),
      });
    }

    if (redirect && isInAppPath(redirect)) {
      response.cookie(CookieName.RedirectPath, redirect, {
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
      response.clearCookie(CookieName.DiscordInvite);
      response.clearCookie(CookieName.RedirectPath);

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
    response.clearCookie(CookieName.DiscordInvite);
    response.clearCookie(CookieName.RedirectPath);

    response.cookie(CookieName.AccessToken, accessToken, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: Duration.fromObject({ days: 7 }).toMillis(),
    });

    response.redirect(redirectTo);
  }

  @Sse('/oidc/device/identity')
  @ApiOkResponse({ type: DeviceFlowEventDto })
  oidcDeviceFlowIdentity(): Observable<MessageEvent> {
    return this.auth.oidcDeviceFlowIdentityObservable();
  }

  @Sse('/oidc/device')
  @ApiOkResponse({ type: DeviceFlowEventDto })
  @ApiQuery({ name: 'connection_type', type: String, required: false, description: 'immich | standalone | restic' })
  @ApiQuery({ name: 'connection_name', type: String, required: false, description: 'Instance name, e.g. a hostname' })
  oidcDeviceFlow(
    @Query('connection_type') connectionType?: string,
    @Query('connection_name') connectionName?: string,
  ): Observable<MessageEvent> {
    return this.auth.oidcDeviceFlowObservable(connectionType, connectionName);
  }

  @Post('/ticket')
  @AuthRoute()
  @ApiOkResponse({ type: TicketCreateResponseDto })
  async createTicket(@Auth() auth: AuthDto, @Body() dto: TicketCreateRequestDto): Promise<TicketCreateResponseDto> {
    return await this.auth.createTicket(auth, dto);
  }

  @Get('/ticket/callback')
  async ticketCallback(@Req() request: Request, @Res() response: Response) {
    const { token, redirectTo } = await this.auth.ticketCallback(request);

    response.clearCookie(CookieName.TicketId);
    response.cookie(CookieName.TicketToken, token, {
      sameSite: 'lax',
      httpOnly: true,
      secure: request.protocol === 'https',
      maxAge: env.TICKET_TTL.toMillis(),
    });

    response.redirect(redirectTo);
  }

  @Get('/ticket/:id')
  @ApiOkResponse({ type: TicketDto })
  getTicket(@Param('id') ticketId: string, @Req() request: Request): Promise<TicketDto> {
    return this.auth.getTicket(ticketId, request.headers);
  }
}
