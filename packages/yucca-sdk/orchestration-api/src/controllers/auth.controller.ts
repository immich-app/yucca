import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { type Response } from 'express';
import { AuthService } from '../services/auth.service';

@Controller('/auth')
export class AuthController {
  constructor(readonly service: AuthService) {}

  @Get('login')
  async login(@Query('next') next: string, @Res() response: Response) {
    const { redirectTo } = await this.service.login(next);
    response.redirect(redirectTo);
  }

  @Get('callback')
  @ApiOkResponse({ type: Object })
  async callback(@Query('code') code: string, @Res() response: Response) {
    const { redirectTo } = await this.service.callback(code);
    response.redirect(redirectTo);
  }
}
