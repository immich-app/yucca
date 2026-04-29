import { OnModuleInit } from '@nestjs/common';
import * as client from 'openid-client';
import { env } from 'src/env';

export class OidcRepository implements OnModuleInit {
  private config!: client.Configuration;
  private deviceConfig!: client.Configuration;

  async onModuleInit() {
    this.config = await client.discovery(env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET, undefined, {
      execute: env.NODE_ENV === 'development' ? [client.allowInsecureRequests] : [],
    });

    if (env.OIDC_REQUIRE_PKCE && !this.config.serverMetadata().supportsPKCE()) {
      throw new Error('OIDC server does not support PKCE while OIDC_REQUIRE_PKCE is true!');
    }

    this.deviceConfig = await client.discovery(
      env.OIDC_DEVICE_ISSUER,
      env.OIDC_DEVICE_CLIENT_ID,
      undefined,
      undefined,
      {
        execute: env.NODE_ENV === 'development' ? [client.allowInsecureRequests] : [],
      },
    );
  }

  async authorize(
    codeChallenge?: string,
    redirectUri?: string,
    state?: string,
  ): Promise<{ redirectTo: URL; state: string; codeVerifier?: string }> {
    let codeVerifier;
    if (!codeChallenge) {
      codeVerifier = client.randomPKCECodeVerifier();
      codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    }

    const parameters: Record<string, string> = {
      redirect_uri: redirectUri ?? env.OIDC_REDIRECT_URI,
      scope: env.OIDC_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    };

    // non-PKCE fallback
    state ??= client.randomState();
    parameters.state = state;

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

  async fetchUserInfo(accessToken: string, sub: string): Promise<client.UserInfoResponse | undefined> {
    return await client.fetchUserInfo(this.config, accessToken, sub);
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

  async deviceFlow(): Promise<{
    userCode: string;
    verificationUri: string;
    tokens: Promise<client.TokenEndpointResponse & client.TokenEndpointResponseHelpers>;
  }> {
    const response = await client.initiateDeviceAuthorization(this.deviceConfig, {
      scope: env.OIDC_SCOPE,
    });

    return {
      userCode: response.userCode,
      verificationUri: (response.verification_uri_complete as string) ?? response.verification_uri,
      tokens: client.pollDeviceAuthorizationGrant(this.deviceConfig, response),
    };
  }
}
