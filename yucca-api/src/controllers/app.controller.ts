import { Controller, Get, OnModuleInit, Req } from '@nestjs/common';
import { AppService } from 'src/services/app.service';

import { type Request } from 'express';
import * as client from 'openid-client';

@Controller()
export class AppController implements OnModuleInit {
  constructor(private readonly service: AppService) {}

  config!: client.Configuration;

  async onModuleInit() {
    const server: URL = new URL('http://localhost:8092'); // Authorization Server's Issuer Identifier
    const clientId: string = 'test'; // Client identifier at the Authorization Server
    const clientSecret: string = 'test'; // Client Secret

    this.config = await client.discovery(server, clientId, clientSecret, undefined, {
      execute: [client.allowInsecureRequests],
    });
  }

  @Get()
  hello(): Promise<string> {
    return this.service.hello();
  }

  code_verifier!: string;
  code_challenge!: string;
  state!: string;

  @Get('/oidc')
  async testOidcStart() {
    const redirect_uri: string = 'http://192.168.1.141:5173/api/oidc/callback';
    const scope: string = 'openid'; // Scope of the access request

    this.code_verifier = client.randomPKCECodeVerifier();
    this.code_challenge = await client.calculatePKCECodeChallenge(this.code_verifier);
    this.state = undefined!;

    const parameters: Record<string, string> = {
      redirect_uri,
      scope,
      code_challenge: this.code_challenge,
      code_challenge_method: 'S256',
    };

    if (!this.config.serverMetadata().supportsPKCE()) {
      /**
       * We cannot be sure the server supports PKCE so we're going to use state too.
       * Use of PKCE is backwards compatible even if the AS doesn't support it which
       * is why we're using it regardless. Like PKCE, random state must be generated
       * for every redirect to the authorization_endpoint.
       */
      this.state = client.randomState();
      parameters.state = this.state;
    } else {
      // bug with oidc mock handling undefined
      this.state = 'yucca';
      parameters.state = this.state;
    }

    const redirectTo: URL = client.buildAuthorizationUrl(this.config, parameters);

    // now redirect the user to redirectTo.href
    console.log('redirecting to', redirectTo.href);
  }

  @Get('/oidc/callback')
  async oidcCallback(@Req() request: Request) {
    const url = new URL(`${request.protocol}://${request.get('Host')}${request.originalUrl}`);

    const tokens = await client.authorizationCodeGrant(this.config, url, {
      pkceCodeVerifier: this.code_verifier,
      expectedState: this.state,
    });

    console.log('Token Endpoint Response', tokens);

    const claims = tokens.claims();
    console.log(claims);
  }
}
