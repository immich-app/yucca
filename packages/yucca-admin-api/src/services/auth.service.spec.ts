import { Mocks, newMocks } from '../../test/mocks';
import { AuthService } from './auth.service';

describe(AuthService.name, () => {
  let mocks: Mocks;
  let sut: AuthService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AuthService(mocks.oidc as never, mocks.wideContext);
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });

  describe('authenticate', () => {
    it('should fail if missing sub cookie', async () => {
      await expect(sut.authenticate({})).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing yucca-admin-sub cookie"`,
      );
    });

    it('should fail if missing access token cookie', async () => {
      await expect(
        sut.authenticate({
          cookie: 'yucca-admin-sub=oidc-sub',
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Missing yucca-admin-access-token cookie"`);
    });

    it('should fail if user info is not returned by provider', async () => {
      await expect(
        sut.authenticate({
          cookie: 'yucca-admin-sub=oidc-sub; yucca-admin-access-token=my-token',
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Missing user info"`);
    });

    it('should return sub if user info is found', async () => {
      const userInfo = { sub: 'oidc-sub', name: 'name', email: 'email' };
      mocks.oidc.fetchUserInfo.mockResolvedValue(userInfo as never);

      await expect(
        sut.authenticate({
          cookie: 'yucca-admin-sub=oidc-sub; yucca-admin-access-token=my-token',
        }),
      ).resolves.toEqual({ sub: userInfo.sub });

      expect(mocks.oidc.fetchUserInfo).toHaveBeenCalledWith('my-token', 'oidc-sub');
      expect(mocks.wideContext.assignContext).toHaveBeenCalledWith({ userInfo });
    });
  });

  describe('logout', () => {
    it('forwards the end-session URL from the OIDC provider', () => {
      const url = new URL('https://idp.example/session/end');
      mocks.oidc.logout.mockReturnValue(url);
      expect(sut.logout()).toBe(url);
    });
  });

  describe('oidcAuthorize', () => {
    it('should forward from OIDC provider', async () => {
      const redirectTo = Symbol('Redirect URL');
      const state = Symbol('State');
      const codeVerifier = Symbol('Code Verifier');
      mocks.oidc.authorize.mockResolvedValue({ redirectTo: { href: redirectTo }, state, codeVerifier } as never);
      await expect(sut.oidcAuthorize()).resolves.toEqual({ redirectTo, state, codeVerifier });
    });
  });

  describe('oidcCallback', () => {
    const request = {
      protocol: 'http',
      get() {
        return 'localhost';
      },
      originalUrl: '',
      headers: {},
      query: {},
    };

    it('should fail if error in URL', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          originalUrl: '?error=abc&error_description=failure',
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"OIDC error: failure"`);
    });

    it('should fail if missing state cookie', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"missing expectedState"`);
    });

    it('should fail if missing code verifier cookie', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'yucca-admin-oidc-state=state',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"missing codeVerifier"`);
    });

    it('should fail if no id token returned from provider', async () => {
      mocks.oidc.callback.mockResolvedValue({ claims: () => null } as never);
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'yucca-admin-oidc-state=state; yucca-admin-oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"no id token received"`);
    });

    it('should return sub and access token from successful callback', async () => {
      const claims = { sub: 'oidc-sub', name: 'name', email: 'email' };
      const accessToken = 'access-token';
      mocks.oidc.callback.mockResolvedValue({ claims: () => claims, access_token: accessToken } as never);

      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'yucca-admin-oidc-state=state; yucca-admin-oidc-code-verifier=code',
          },
        } as never),
      ).resolves.toEqual({
        redirectTo: '/',
        sub: claims.sub,
        accessToken,
      });

      expect(mocks.oidc.callback).toHaveBeenCalledWith(expect.any(URL), 'state', 'code');
      expect(mocks.wideContext.assignContext).toHaveBeenCalledWith({ claims });
    });
  });
});
