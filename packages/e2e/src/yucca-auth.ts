import { parse } from 'cookie';
import { env } from 'src/env';

export const yuccaBaseUrl = `http://localhost:${env.YUCCA_API_PORT}`;

export const loginWithIdp = async (sub: string): Promise<string | undefined> => {
  const { headers: loginHeaders } = await fetch(`${yuccaBaseUrl}/api/auth/oidc/login`, {
    redirect: 'manual',
  });

  const redirectUrl = new URL(loginHeaders.get('Location')!);
  redirectUrl.pathname = '/api/form';
  redirectUrl.searchParams.set('sub', sub);

  const { headers: oidcHeaders } = await fetch(redirectUrl, {
    redirect: 'manual',
  });

  const { headers: callbackHeaders } = await fetch(oidcHeaders.get('Location'), {
    redirect: 'manual',
    headers: {
      Cookie: loginHeaders.getSetCookie().join('; '),
    },
  });

  return parse(callbackHeaders.getSetCookie().join('; '))['yucca-access-token'];
};
