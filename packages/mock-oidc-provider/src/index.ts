import { createServer } from 'node:http';
import Provider, { type Configuration } from 'oidc-provider';
import { env } from './env.js';

type ProviderCtx = Parameters<Parameters<Provider['use']>[0]>[0];

const configuration: Configuration = {
  clients: [
    {
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      redirect_uris: [env.REDIRECT_URI, env.ADMIN_REDIRECT_URI],
      post_logout_redirect_uris: [env.POST_LOGOUT_REDIRECT_URI, env.ADMIN_POST_LOGOUT_REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
    },
    {
      client_id: env.DEVICE_CLIENT_ID,
      redirect_uris: [],
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
      response_types: [],
      token_endpoint_auth_method: 'none',
    },
  ],
  features: {
    devInteractions: { enabled: true },
    deviceFlow: { enabled: true },
    rpInitiatedLogout: { enabled: true },
    resourceIndicators: { enabled: false },
  },
  conformIdTokenClaims: false,
  pkce: { required: () => true },
  scopes: ['openid', 'profile', 'email'],
  claims: {
    openid: ['sub'],
    profile: ['name'],
    email: ['email', 'email_verified'],
  },
  cookies: { keys: ['mock-oidc-provider-dev'] },
  ttl: {
    AccessToken: 3600,
    AuthorizationCode: 600,
    DeviceCode: 600,
    IdToken: 3600,
    RefreshToken: 86_400,
  },
  findAccount: (_ctx, sub) => ({
    accountId: sub,
    claims: () => ({ sub, name: sub, email: `${sub}@example.test`, email_verified: true }),
  }),
};

async function issueAuthorizationCode(provider: Provider, ctx: ProviderCtx): Promise<void> {
  const { sub, client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = ctx.query;

  if (typeof sub !== 'string' || typeof client_id !== 'string' || typeof redirect_uri !== 'string') {
    ctx.status = 400;
    ctx.body = { error: 'sub, client_id, and redirect_uri are required query parameters' };
    return;
  }

  const client = await provider.Client.find(client_id);
  if (!client) {
    ctx.status = 404;
    ctx.body = { error: `client_id "${client_id}" not found` };
    return;
  }

  const grantedScope = typeof scope === 'string' ? scope : 'openid';
  const grant = new provider.Grant({ accountId: sub, clientId: client_id });
  grant.addOIDCScope(grantedScope);
  const grantId = await grant.save();

  const code = new provider.AuthorizationCode({
    accountId: sub,
    client,
    redirectUri: redirect_uri,
    scope: grantedScope,
    codeChallenge: typeof code_challenge === 'string' ? code_challenge : undefined,
    codeChallengeMethod: typeof code_challenge_method === 'string' ? code_challenge_method : undefined,
    grantId,
    gty: 'authorization_code',
  });
  const codeValue = await code.save();

  const callback = new URL(redirect_uri);
  callback.searchParams.set('code', codeValue);
  callback.searchParams.set('iss', env.ISSUER);
  if (typeof state === 'string') {
    callback.searchParams.set('state', state);
  }
  ctx.redirect(callback.href);
}

async function approveDeviceCode(provider: Provider, ctx: ProviderCtx): Promise<void> {
  const { user_code, sub } = ctx.query;

  if (typeof user_code !== 'string' || typeof sub !== 'string') {
    ctx.status = 400;
    ctx.body = { error: 'user_code and sub are required query parameters' };
    return;
  }

  const normalized = user_code.toUpperCase().replaceAll(/\W/g, '');
  const deviceCode = await provider.DeviceCode.findByUserCode(normalized);
  if (!deviceCode) {
    ctx.status = 404;
    ctx.body = { error: `user_code "${user_code}" not found` };
    return;
  }

  const requestedScope = deviceCode.params?.scope;
  const grantedScope = typeof requestedScope === 'string' ? requestedScope : 'openid';

  const grant = new provider.Grant({ accountId: sub, clientId: deviceCode.clientId });
  grant.addOIDCScope(grantedScope);
  const grantId = await grant.save();

  deviceCode.accountId = sub;
  deviceCode.grantId = grantId;
  deviceCode.scope = grantedScope;
  deviceCode.authTime = Math.floor(Date.now() / 1000);
  await deviceCode.save();

  ctx.body = { ok: true };
}

function bootstrap(): void {
  const provider = new Provider(env.ISSUER, configuration);

  provider.use(async (ctx, next) => {
    if (ctx.method === 'GET') {
      switch (ctx.path) {
        case '/api/form': {
          await issueAuthorizationCode(provider, ctx);
          return;
        }
        case '/api/form/device': {
          await approveDeviceCode(provider, ctx);
          return;
        }
        case '/session/end': {
          const postLogoutUri = ctx.query.post_logout_redirect_uri;
          if (typeof postLogoutUri === 'string') {
            ctx.status = 302;
            ctx.set('Location', postLogoutUri);
            return;
          }
          break;
        }
      }
    }
    await next();
  });

  const handler = provider.callback();
  createServer((req, res) => {
    void handler(req, res);
  }).listen(env.PORT, () => {
    console.log(`mock-oidc-provider listening on port ${env.PORT} (issuer: ${env.ISSUER})`);
  });
}

bootstrap();
