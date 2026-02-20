import { AuthDto } from 'src/dto/auth.dto';
import { Mocks, newMocks } from '../../test/mocks';
import { AuthService } from './auth.service';

const mockAuth: AuthDto = {
  id: 'user',
  email: 'user@example.com',
  name: 'user',
  sessionId: 'session',
};

const mockUser = {
  id: 'user',
  email: 'user@example.com',
  name: 'user',
  sub: 'oidc-sub',
  sessionId: 'session',
};

describe(AuthService.name, () => {
  let mocks: Mocks;
  let sut: AuthService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AuthService(
      mocks.jwt as never,
      mocks.oidc as never,
      mocks.user as never,
      mocks.crypto,
      mocks.session as never,
      mocks.wideContext,
    );
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });

  describe('authenticate', () => {
    it('should fail if missing access token cookie', async () => {
      await expect(sut.authenticate({})).rejects.toThrowErrorMatchingInlineSnapshot(`"Missing access-token cookie"`);
    });

    it('should fail if access token is invalid', async () => {
      await expect(
        sut.authenticate({
          cookie: 'access-token=my-token',
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid access token"`);
    });

    it('should return user if one is found', async () => {
      mocks.user.getByAccessToken.mockResolvedValue(mockUser);
      await expect(
        sut.authenticate({
          cookie: 'access-token=my-token',
        }),
      ).resolves.toBe(mockUser);
      expect(mocks.wideContext.addContext).toHaveBeenCalledWith('customerId', mockUser.id);
    });
  });

  describe('logout', () => {
    it('should forward URL from OIDC provider', async () => {
      const redirectUrl = Symbol('Redirect URL');
      mocks.oidc.logout.mockResolvedValue(redirectUrl as never);
      await expect(sut.logout(mockAuth)).resolves.toBe(redirectUrl);
      expect(mocks.session.delete).toHaveBeenCalledWith(mockAuth.sessionId);
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
    };

    it('should fail if error in URL', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          originalUrl: '?error=abc&error_description=failure',
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"OIDC callback: failure"`);
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
            cookie: 'oidc-state=state',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"missing codeVerifier"`);
    });

    it('should fail if no id token returned from provider', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'oidc-state=state; oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"no id token received"`);
    });

    it('should fail if no id token returned from provider', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'oidc-state=state; oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"no id token received"`);
    });

    it('should fail if name claim missing from provider', async () => {
      mocks.oidc.callback.mockResolvedValue({} as never);
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'oidc-state=state; oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"name is missing from claims"`);
    });

    it('should fail if email claim missing from provider', async () => {
      mocks.oidc.callback.mockResolvedValue({
        name: 'name',
      } as never);
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'oidc-state=state; oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"email is missing from claims"`);
    });

    it('should create a new user if one does not exist', async () => {
      const claims = {
        name: 'name',
        email: 'email',
      };

      const accessToken = Symbol('Access Token');

      mocks.user.getBySub.mockResolvedValue(void 0);
      mocks.user.create.mockResolvedValue(mockUser);
      mocks.oidc.callback.mockResolvedValue(claims as never);
      mocks.crypto.randomHex.mockReturnValue(accessToken as never);

      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'oidc-state=state; oidc-code-verifier=code',
          },
        } as never),
      ).resolves.toEqual(
        expect.objectContaining({
          accessToken,
        }),
      );

      expect(mocks.wideContext.assignContext).toHaveBeenCalledWith({ claims });
      expect(mocks.wideContext.addContext).toHaveBeenCalledWith('customerId', mockUser.id);
      expect(mocks.session.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        accessToken,
      });
    });

    it('should use existing user if it exists', async () => {
      const claims = {
        name: 'name',
        email: 'email',
      };

      const accessToken = Symbol('Access Token');

      mocks.user.getBySub.mockResolvedValue(mockUser);
      mocks.oidc.callback.mockResolvedValue(claims as never);
      mocks.crypto.randomHex.mockReturnValue(accessToken as never);

      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'oidc-state=state; oidc-code-verifier=code',
          },
        } as never),
      ).resolves.toEqual(
        expect.objectContaining({
          accessToken,
        }),
      );

      expect(mocks.user.update).toHaveBeenCalledWith(mockUser.id, expect.any(Object));
      expect(mocks.wideContext.assignContext).toHaveBeenCalledWith({ claims });
      expect(mocks.wideContext.addContext).toHaveBeenCalledWith('customerId', mockUser.id);
      expect(mocks.session.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        accessToken,
      });
    });
  });
});
