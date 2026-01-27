import env from '@common/server/env';
import { OnModuleInit } from '@nestjs/common';
import * as client from 'openid-client';

export class OidcRepository implements OnModuleInit {
  config!: client.Configuration;

  async onModuleInit() {
    this.config = await client.discovery(env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET, undefined, {
      execute: [client.allowInsecureRequests],
    });

    if (env.OIDC_REQUIRE_PKCE && !this.config.serverMetadata().supportsPKCE()) {
      throw new Error('OIDC server does not support PKCE while OIDC_REQUIRE_PKCE is true!');
    }
  }

  async authorize(): Promise<{ redirectTo: URL; state: string; codeVerifier: string }> {
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    let state: string | undefined;

    const parameters: Record<string, string> = {
      redirect_uri: env.OIDC_REDIRECT_URI,
      scope: env.OIDC_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    };

    if (this.config.serverMetadata().supportsPKCE()) {
      // we are using PKCE, but populate state anyways
      // to avoid issues with the OIDC mock server
      state = 'yucca';
      parameters.state = state;
    } else {
      // non-PKCE fallback
      state = client.randomState();
      parameters.state = state;
    }

    const redirectTo: URL = client.buildAuthorizationUrl(this.config, parameters);

    return { redirectTo, state, codeVerifier };
  }

  async callback(url: URL, expectedState: string, pkceCodeVerifier: string): Promise<client.IDToken | undefined> {
    const tokens = await client.authorizationCodeGrant(this.config, url, {
      pkceCodeVerifier,
      expectedState,
    });

    return tokens.claims();
  }

  logout(): URL | void {
    const endpoint = this.config.serverMetadata().end_session_endpoint;

    if (endpoint) {
      const url = new URL(endpoint);
      url.searchParams.set('client_id', env.OIDC_CLIENT_ID);
      url.searchParams.set('post_logout_redirect_uri', env.OIDC_LOGOUT_REDIRECT_URI);
      return url;
    }
  }
}
