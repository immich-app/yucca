import { JwtService } from '@nestjs/jwt';
import { createHash, createPublicKey } from 'node:crypto';
import { env } from 'src/env';
import { Mocks, newMocks } from '../../test/mocks';
import { AuthService } from './auth.service';

// Real JwtService over the local-dev keypair: the CLI-flow tests exercise
// actual ES256 mint/verify rather than mocked crypto.
const newJwtService = () =>
  new JwtService({
    privateKey: env.JWT_PRIVATE_KEY,
    publicKey: createPublicKey(env.JWT_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString(),
    signOptions: { algorithm: 'ES256', expiresIn: env.JWT_EXPIRES_IN },
    verifyOptions: { algorithms: ['ES256'] },
  });

describe(AuthService.name, () => {
  let mocks: Mocks;
  let sut: AuthService;

  beforeEach(() => {
    mocks = newMocks();
    sut = new AuthService(mocks.oidc as never, newJwtService(), mocks.wideContext);
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });

  describe('authenticate', () => {
    it('should fail if missing sub cookie', async () => {
      await expect(sut.authenticate({})).rejects.toThrowErrorMatchingInlineSnapshot(`"Missing yucca-admin-sub cookie"`);
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

  describe('cli login flow', () => {
    const verifier = 'cli-verifier-0123456789abcdef';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    it('should authenticate a Bearer token minted via cliToken', async () => {
      const code = await sut.mintCliCode('oidc-sub', challenge);
      const { accessToken, sub, expiresAt } = await sut.cliToken(code, verifier);

      expect(sub).toBe('oidc-sub');
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      await expect(sut.authenticate({ authorization: `Bearer ${accessToken}` })).resolves.toEqual({ sub: 'oidc-sub' });
    });

    it('should reject a mismatched code verifier', async () => {
      const code = await sut.mintCliCode('oidc-sub', challenge);
      await expect(sut.cliToken(code, 'some-other-verifier')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"code_verifier does not match code_challenge"`,
      );
    });

    it('should reject a session token used as a code and vice versa', async () => {
      const code = await sut.mintCliCode('oidc-sub', challenge);
      const { accessToken } = await sut.cliToken(code, verifier);

      await expect(sut.cliToken(accessToken, verifier)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid or expired CLI login code"`,
      );
      await expect(sut.authenticate({ authorization: `Bearer ${code}` })).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid CLI session token"`,
      );
    });

    it('should reject garbage Bearer tokens', async () => {
      await expect(sut.authenticate({ authorization: 'Bearer not-a-jwt' })).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid CLI session token"`,
      );
    });

    it('should validate cli login params', () => {
      expect(() => sut.parseCliLoginParams('80', 'a'.repeat(32), challenge)).toThrow('port');
      expect(() => sut.parseCliLoginParams('8000', 'bad state!', challenge)).toThrow('state');
      expect(() => sut.parseCliLoginParams('8000', 'a'.repeat(32), 'nope~')).toThrow('code_challenge');
      expect(sut.parseCliLoginParams('8000', 'a'.repeat(32), challenge)).toEqual({
        port: 8000,
        state: 'a'.repeat(32),
        codeChallenge: challenge,
      });
    });
  });
});
