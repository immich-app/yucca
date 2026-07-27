import { AuthDto } from 'src/dto/auth.dto';
import { env } from 'src/env';
import { Mocks, newMocks } from '../../test/mocks';
import { AuthService } from './auth.service';

const mockAuth: AuthDto = {
  id: 'user',
  email: 'user@example.com',
  name: 'user',
  sessionId: 'session',
  consumerId: null,
  features: {},
};

const mockUser = {
  id: 'user',
  email: 'user@example.com',
  name: 'user',
  sub: 'oidc-sub',
  sessionId: 'session',
  consumerId: null,
};

describe(AuthService.name, () => {
  let mocks: Mocks;
  let sut: AuthService;
  let allowedEmailDomains: string[];

  beforeEach(() => {
    mocks = newMocks();
    sut = new AuthService(
      mocks.jwt as never,
      mocks.oidc as never,
      mocks.user as never,
      mocks.userAllowlist as never,
      mocks.crypto,
      mocks.session as never,
      mocks.wideContext,
      mocks.consumer as never,
      mocks.featureFlag as never,
    );
    allowedEmailDomains = env.ALLOWED_EMAIL_DOMAINS;
    env.ALLOWED_EMAIL_DOMAINS = [];
  });

  afterEach(() => {
    env.ALLOWED_EMAIL_DOMAINS = allowedEmailDomains;
  });

  it('should exist', () => {
    expect(sut).toBeDefined();
  });

  describe('authenticate', () => {
    it('should fail if missing access token cookie', async () => {
      await expect(sut.authenticate({})).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Missing yucca-access-token cookie"`,
      );
    });

    it('should fail if access token is invalid', async () => {
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid access token"`);
    });

    it('should return user if one is found', async () => {
      mocks.user.getByAccessToken.mockResolvedValue(mockUser);
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).resolves.toEqual({ ...mockUser, features: { 'consumer-restic': false, 'consumer-fubar': false } });
      expect(mocks.wideContext.addContext).toHaveBeenCalledWith('customerId', mockUser.id);
    });

    it('should resolve feature overrides over registry defaults', async () => {
      mocks.user.getByAccessToken.mockResolvedValue(mockUser);
      mocks.featureFlag.getByUser.mockResolvedValue([{ flag: 'consumer-fubar', value: true }]);
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).resolves.toEqual(expect.objectContaining({ features: { 'consumer-restic': false, 'consumer-fubar': true } }));
    });

    it('should ignore overrides for flags not in the registry', async () => {
      mocks.user.getByAccessToken.mockResolvedValue(mockUser);
      mocks.featureFlag.getByUser.mockResolvedValue([{ flag: 'no-longer-a-flag', value: true }]);
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).resolves.toEqual(expect.objectContaining({ features: { 'consumer-restic': false, 'consumer-fubar': false } }));
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
            cookie: 'yucca-oidc-state=state',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"missing codeVerifier"`);
    });

    it('should fail if no id token returned from provider', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'yucca-oidc-state=state; yucca-oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"no id token received"`);
    });

    it('should fail if no id token returned from provider', async () => {
      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'yucca-oidc-state=state; yucca-oidc-code-verifier=code',
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
            cookie: 'yucca-oidc-state=state; yucca-oidc-code-verifier=code',
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
            cookie: 'yucca-oidc-state=state; yucca-oidc-code-verifier=code',
          },
        } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"email is missing from claims"`);
    });

    it('should create a new user if one does not exist', async () => {
      const claims = {
        name: 'name',
        email: 'name@example.test',
      };

      const accessToken = Symbol('Access Token');

      env.ALLOWED_EMAIL_DOMAINS = ['example.test'];
      mocks.user.getBySub.mockResolvedValue(void 0);
      mocks.user.create.mockResolvedValue(mockUser);
      mocks.oidc.callback.mockResolvedValue(claims as never);
      mocks.crypto.randomHex.mockReturnValue(accessToken as never);

      await expect(
        sut.oidcCallback({
          ...request,
          headers: {
            cookie: 'yucca-oidc-state=state; yucca-oidc-code-verifier=code',
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
        kind: 'web',
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
            cookie: 'yucca-oidc-state=state; yucca-oidc-code-verifier=code',
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
        kind: 'web',
      });
    });
  });

  describe('oidcDeviceFlow', () => {
    const claims = { sub: 'oidc-sub', name: 'name', email: 'user@example.com' };
    const accessToken = 'device-token';

    beforeEach(() => {
      mocks.oidc.deviceFlow.mockResolvedValue({
        userCode: 'CODE',
        verificationUri: 'http://verify',
        claims: Promise.resolve(claims),
      } as never);
      mocks.user.getBySub.mockResolvedValue({ ...mockUser, disabled: false } as never);
      mocks.crypto.randomHex.mockReturnValue(accessToken);
      mocks.consumer.getOrCreateDefault.mockResolvedValue({ id: 'default-consumer' } as never);
    });

    it('binds the default consumer for legacy clients (no consumer params)', async () => {
      await expect(sut.oidcDeviceFlow(jest.fn())).resolves.toEqual({ accessToken });

      expect(mocks.consumer.getOrCreateDefault).toHaveBeenCalledWith(mockUser.id);
      expect(mocks.consumer.touchLastSeen).toHaveBeenCalledWith('default-consumer');
      expect(mocks.session.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        accessToken,
        consumerId: 'default-consumer',
        kind: 'device',
      });
    });

    it('rejects a fubar consumer without the consumer-fubar flag', async () => {
      await expect(sut.oidcDeviceFlow(jest.fn(), 'fubar', 'my-laptop')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Feature 'consumer-fubar' is not enabled for this account"`,
      );
      expect(mocks.session.create).not.toHaveBeenCalled();
    });

    it('binds a named immich instance for everyone (no flag needed)', async () => {
      mocks.consumer.getByUserTypeName.mockResolvedValue(void 0);
      mocks.consumer.create.mockResolvedValue({ id: 'immich-home' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'immich', 'home-server')).resolves.toEqual({ accessToken });

      expect(mocks.consumer.create).toHaveBeenCalledWith({ userId: mockUser.id, type: 'immich', name: 'home-server' });
      expect(mocks.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ consumerId: 'immich-home', kind: 'device' }),
      );
    });

    it('creates a fubar consumer instance when consumer-fubar is on', async () => {
      mocks.featureFlag.getByUser.mockResolvedValue([{ flag: 'consumer-fubar', value: true }]);
      mocks.consumer.getByUserTypeName.mockResolvedValue(void 0);
      mocks.consumer.create.mockResolvedValue({ id: 'fubar-consumer' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'fubar', 'my-laptop')).resolves.toEqual({ accessToken });

      expect(mocks.consumer.create).toHaveBeenCalledWith({ userId: mockUser.id, type: 'fubar', name: 'my-laptop' });
      expect(mocks.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ consumerId: 'fubar-consumer', kind: 'device' }),
      );
    });

    it('reuses an existing consumer instance by (type, name)', async () => {
      mocks.featureFlag.getByUser.mockResolvedValue([{ flag: 'consumer-fubar', value: true }]);
      mocks.consumer.getByUserTypeName.mockResolvedValue({ id: 'existing-fubar' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'fubar', 'my-laptop')).resolves.toEqual({ accessToken });

      expect(mocks.consumer.create).not.toHaveBeenCalled();
      expect(mocks.session.create).toHaveBeenCalledWith(expect.objectContaining({ consumerId: 'existing-fubar' }));
    });

    it('rejects unknown consumer types', async () => {
      await expect(sut.oidcDeviceFlow(jest.fn(), 'winamp')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unknown consumer type 'winamp'"`,
      );
    });
  });

  describe('getOrCreateUser', () => {
    const claims = {
      sub: 'new-sub',
      name: 'name',
      email: 'New@Example.com',
    };

    const entry = {
      id: 'entry',
      email: 'new@example.com',
      inviteCode: 'CODE123456',
      invited: true,
      inviteUsed: false,
      inviteUsedAt: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mocks.user.getBySub.mockResolvedValue(void 0);
      mocks.user.create.mockResolvedValue(mockUser);
    });

    it('should allow a new user whose email domain is allowed', async () => {
      env.ALLOWED_EMAIL_DOMAINS = ['example.com'];

      await expect(sut.getOrCreateUser(claims)).resolves.toBe(mockUser);

      expect(mocks.userAllowlist.getByEmail).not.toHaveBeenCalled();
      expect(mocks.user.create).toHaveBeenCalledWith({ sub: claims.sub, name: claims.name, email: claims.email });
    });

    it('should allow a new user with an invited allowlist entry and mark it used', async () => {
      mocks.userAllowlist.getByEmail.mockResolvedValue(entry);

      await expect(sut.getOrCreateUser(claims)).resolves.toBe(mockUser);

      expect(mocks.userAllowlist.getByEmail).toHaveBeenCalledWith('new@example.com');
      expect(mocks.userAllowlist.markUsed).toHaveBeenCalledWith(entry.id);
    });

    it('should not mark an already-used allowlist entry again', async () => {
      mocks.userAllowlist.getByEmail.mockResolvedValue({ ...entry, inviteUsed: true });

      await expect(sut.getOrCreateUser(claims)).resolves.toBe(mockUser);

      expect(mocks.userAllowlist.markUsed).not.toHaveBeenCalled();
    });

    it('should reject a new user whose allowlist entry is only staged', async () => {
      mocks.userAllowlist.getByEmail.mockResolvedValue({ ...entry, invited: false });

      await expect(sut.getOrCreateUser(claims)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Email is not allowed during the beta"`,
      );
      expect(mocks.user.create).not.toHaveBeenCalled();
    });

    it('should allow a new user with a valid invite code and mark it used', async () => {
      mocks.userAllowlist.getByInviteCode.mockResolvedValue(entry);

      await expect(sut.getOrCreateUser(claims, 'code123456')).resolves.toBe(mockUser);

      expect(mocks.userAllowlist.getByInviteCode).toHaveBeenCalledWith('CODE123456');
      expect(mocks.userAllowlist.markUsed).toHaveBeenCalledWith(entry.id);
    });

    it('should reject an already-used invite code', async () => {
      mocks.userAllowlist.getByInviteCode.mockResolvedValue({ ...entry, inviteUsed: true });

      await expect(sut.getOrCreateUser(claims, 'CODE123456')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Email is not allowed during the beta"`,
      );
      expect(mocks.userAllowlist.markUsed).not.toHaveBeenCalled();
      expect(mocks.user.create).not.toHaveBeenCalled();
    });

    it('should reject a new user with no allowlist match', async () => {
      await expect(sut.getOrCreateUser(claims)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Email is not allowed during the beta"`,
      );
      expect(mocks.user.create).not.toHaveBeenCalled();
    });

    it('should let an existing user log in regardless of the allowlist', async () => {
      mocks.user.getBySub.mockResolvedValue(mockUser);

      await expect(sut.getOrCreateUser(claims)).resolves.toEqual(mockUser);

      expect(mocks.userAllowlist.getByEmail).not.toHaveBeenCalled();
      expect(mocks.user.update).toHaveBeenCalledWith(mockUser.id, { name: claims.name, email: claims.email });
    });
  });
});
