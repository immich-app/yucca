import { Controller, Get, Req, Res } from '@nestjs/common';
import { parse } from 'cookie';
import { type Request, type Response } from 'express';
import { OidcRepository } from 'src/repositories/oidc.repository';
import { AppService } from 'src/services/app.service';

@Controller()
export class AppController {
  constructor(
    private readonly service: AppService,
    private readonly oidc: OidcRepository,
  ) {}

  @Get()
  hello(): Promise<string> {
    return this.service.hello();
  }

  code_verifier!: string;
  code_challenge!: string;
  state!: string;

  @Get('/oidc/login')
  async oidcStart(@Res() response: Response) {
    const { redirectTo, state, codeVerifier } = await this.oidc.authorize();

    // todo: refactor; signing/integrity required?
    response.cookie('oidc-state', state);
    response.cookie('oidc-code-verifier', codeVerifier);

    return { redirectTo };
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const url = new URL(`${request.protocol}://${request.get('Host')}${request.originalUrl}`);
    const cookies = parse(request.headers.cookie || '');
    // todo: refactor
    const claims = await this.oidc.callback(url, cookies['oidc-state']!, cookies['oidc-code-verifier']!);
    console.log(claims);

    response.clearCookie('oidc-state');
    response.clearCookie('oidc-code-verifier');

    response.redirect('/');
  }
}
