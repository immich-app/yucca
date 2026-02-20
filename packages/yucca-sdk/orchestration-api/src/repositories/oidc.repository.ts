import { Inject, OnModuleInit } from '@nestjs/common';
import * as client from 'openid-client';
import { ORCHESTRATION_PORT } from '../const';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';

export class OidcRepository implements OnModuleInit {
  private config!: client.Configuration;

  constructor(@Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig) {}

  async onModuleInit() {
    this.config = await client.discovery(
      this.moduleConfig.yuccaProductionIssuer,
      this.moduleConfig.yuccaProductionClientId,
      undefined,
      undefined,
      {
        execute: [client.allowInsecureRequests],
      },
    );

    if (this.moduleConfig.yuccaProductionRequirePKCE && !this.config.serverMetadata().supportsPKCE()) {
      throw new Error('OIDC server does not support PKCE while OIDC_REQUIRE_PKCE is true!');
    }
  }

  async authorize(): Promise<{ redirectTo: URL; state: string; codeVerifier: string }> {
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    const parameters: Record<string, string> = {
      redirect_uri: `http://localhost:${ORCHESTRATION_PORT}/api/auth/oidc/callback`,
      scope: this.moduleConfig.yuccaProductionScope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    };

    // non-PKCE fallback
    const state = client.randomState();
    parameters.state = state;

    const redirectTo: URL = client.buildAuthorizationUrl(this.config, parameters);

    return { redirectTo, state, codeVerifier };
  }

  callback(
    url: URL,
    expectedState: string,
    pkceCodeVerifier: string,
  ): Promise<(client.TokenEndpointResponse & client.TokenEndpointResponseHelpers) | undefined> {
    return client.authorizationCodeGrant(this.config, url, {
      pkceCodeVerifier,
      expectedState,
    });
  }

  logout(): URL | void {
    const endpoint = this.config.serverMetadata().end_session_endpoint;

    if (endpoint) {
      const url = new URL(endpoint);
      url.searchParams.set('client_id', this.moduleConfig.yuccaProductionClientId);
      url.searchParams.set('post_logout_redirect_uri', 'http://example.com'); // TODO -- send us back to the app
      return url;
    }
  }
}
