import { UnauthorizedException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { TicketAction } from 'src/enum';
import { env } from 'src/env';
import { Mocks, newMocks } from '../../test/mocks';
import { AuthService } from './auth.service';

const mockAuth: AuthDto = {
  id: 'user',
  email: 'user@example.com',
  name: 'user',
  sessionId: 'session',
  connectionId: null,
  features: {},
};

const mockUser = {
  id: 'user',
  email: 'user@example.com',
  name: 'user',
  sub: 'oidc-sub',
  sessionId: 'session',
  connectionId: null,
};

const mockTicket = {
  id: 'ticket',
  token: 'ticket-token',
  oidcState: 'state',
  oidcCodeVerifier: 'verifier',
  userId: 'user',
  repositoryId: 'repository',
  action: TicketAction.DeleteRepository,
  validAt: null,
  expiresAt: new Date('2026-01-01T00:10:00Z'),
  consumedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe(AuthService.name, () => {
  let mocks: Mocks;
  let sut: AuthService;
  let allowedEmailDomains: string[];

  beforeEach(() => {
    mocks = newMocks();
    sut = new AuthService(
      mocks.logger as never,
      mocks.oidc as never,
      mocks.user as never,
      mocks.userAllowlist as never,
      mocks.crypto,
      mocks.session as never,
      mocks.wideContext,
      mocks.connection as never,
      mocks.discord as never,
      mocks.ticket as never,
      mocks.repository as never,
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
      mocks.user.getByAccessToken.mockResolvedValue({ ...mockUser, featureOverrides: [] });
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).resolves.toEqual({ ...mockUser, features: { 'connection-restic': false } });
      expect(mocks.wideContext.addContext).toHaveBeenCalledWith('customerId', mockUser.id);
    });

    it('should resolve feature overrides over registry defaults', async () => {
      mocks.user.getByAccessToken.mockResolvedValue({
        ...mockUser,
        featureOverrides: [{ flag: 'connection-restic', value: true }],
      });
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).resolves.toEqual(expect.objectContaining({ features: { 'connection-restic': true } }));
    });

    it('should ignore overrides for flags not in the registry', async () => {
      mocks.user.getByAccessToken.mockResolvedValue({
        ...mockUser,
        featureOverrides: [{ flag: 'no-longer-a-flag', value: true }],
      });
      await expect(
        sut.authenticate({
          cookie: 'yucca-access-token=my-token',
        }),
      ).resolves.toEqual(expect.objectContaining({ features: { 'connection-restic': false } }));
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
      mocks.connection.getOrCreateDefault.mockResolvedValue({ id: 'default-connection' } as never);
    });

    it('binds the default connection for legacy clients (no connection params)', async () => {
      await expect(sut.oidcDeviceFlow(jest.fn())).resolves.toEqual({ accessToken });

      expect(mocks.connection.getOrCreateDefault).toHaveBeenCalledWith(mockUser.id);
      expect(mocks.connection.touchLastSeen).toHaveBeenCalledWith('default-connection');
      expect(mocks.session.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        accessToken,
        connectionId: 'default-connection',
        kind: 'device',
      });
    });

    it('rejects a restic connection without the connection-restic flag', async () => {
      await expect(sut.oidcDeviceFlow(jest.fn(), 'restic', 'my-laptop')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Feature 'connection-restic' is not enabled for this account"`,
      );
      expect(mocks.session.create).not.toHaveBeenCalled();
    });

    it('binds a named immich instance for everyone (no flag needed)', async () => {
      mocks.connection.getByUserTypeName.mockResolvedValue(void 0);
      mocks.connection.create.mockResolvedValue({ id: 'immich-home' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'immich', 'home-server')).resolves.toEqual({ accessToken });

      expect(mocks.connection.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        type: 'immich',
        name: 'home-server',
      });
      expect(mocks.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ connectionId: 'immich-home', kind: 'device' }),
      );
    });

    it('binds a standalone instance for everyone (no flag needed)', async () => {
      mocks.connection.getByUserTypeName.mockResolvedValue(void 0);
      mocks.connection.create.mockResolvedValue({ id: 'standalone-nas' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'standalone', 'nas')).resolves.toEqual({ accessToken });

      expect(mocks.connection.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        type: 'standalone',
        name: 'nas',
      });
      expect(mocks.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ connectionId: 'standalone-nas', kind: 'device' }),
      );
    });

    it('creates a restic connection instance when connection-restic is on', async () => {
      mocks.user.getFeatureOverrides.mockResolvedValue([{ flag: 'connection-restic', value: true }]);
      mocks.connection.getByUserTypeName.mockResolvedValue(void 0);
      mocks.connection.create.mockResolvedValue({ id: 'restic-connection' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'restic', 'my-laptop')).resolves.toEqual({ accessToken });

      expect(mocks.connection.create).toHaveBeenCalledWith({ userId: mockUser.id, type: 'restic', name: 'my-laptop' });
      expect(mocks.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ connectionId: 'restic-connection', kind: 'device' }),
      );
    });

    it('reuses an existing connection instance by (type, name)', async () => {
      mocks.user.getFeatureOverrides.mockResolvedValue([{ flag: 'connection-restic', value: true }]);
      mocks.connection.getByUserTypeName.mockResolvedValue({ id: 'existing-restic' } as never);

      await expect(sut.oidcDeviceFlow(jest.fn(), 'restic', 'my-laptop')).resolves.toEqual({ accessToken });

      expect(mocks.connection.create).not.toHaveBeenCalled();
      expect(mocks.session.create).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'existing-restic' }));
    });

    it('rejects unknown connection types', async () => {
      await expect(sut.oidcDeviceFlow(jest.fn(), 'winamp')).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Unknown connection type 'winamp'"`,
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

    describe('discord invites', () => {
      const inviteRequest = {
        id: 'request-id',
        code: 'token',
        allowlistId: 'entry',
        discordUserId: '123456789',
        discordUsername: 'someone',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      };

      it('should allow a new user with a valid discord invite, link the account, and mark the claim used', async () => {
        mocks.discord.consumeInviteRequest.mockResolvedValue(inviteRequest);
        mocks.userAllowlist.markUsed.mockResolvedValue({ id: 'entry' } as never);

        await expect(sut.getOrCreateUser(claims, undefined, 'token')).resolves.toBe(mockUser);

        expect(mocks.discord.consumeInviteRequest).toHaveBeenCalledWith('token');
        expect(mocks.userAllowlist.getByEmail).not.toHaveBeenCalled();
        expect(mocks.discord.linkDirect).toHaveBeenCalledWith(mockUser.id, '123456789', 'someone');
        expect(mocks.userAllowlist.markUsed).toHaveBeenCalledWith('entry');
      });

      it('should consume the token before creating the user so a lost race falls back to the allowlist', async () => {
        mocks.discord.consumeInviteRequest.mockResolvedValue(void 0);

        await expect(sut.getOrCreateUser(claims, undefined, 'token')).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Email is not allowed during the beta"`,
        );
        expect(mocks.discord.linkDirect).not.toHaveBeenCalled();
        expect(mocks.user.create).not.toHaveBeenCalled();
      });

      it('should warn instead of failing when the claim was revoked mid-redemption', async () => {
        mocks.discord.consumeInviteRequest.mockResolvedValue(inviteRequest);
        mocks.userAllowlist.markUsed.mockResolvedValue(void 0);

        await expect(sut.getOrCreateUser(claims, undefined, 'token')).resolves.toBe(mockUser);

        expect(mocks.logger.warn).toHaveBeenCalled();
      });

      it('should link an existing user who redeems a discord invite', async () => {
        mocks.user.getBySub.mockResolvedValue(mockUser);
        mocks.discord.consumeInviteRequest.mockResolvedValue(inviteRequest);
        mocks.userAllowlist.markUsed.mockResolvedValue({ id: 'entry' } as never);

        await expect(sut.getOrCreateUser(claims, undefined, 'token')).resolves.toEqual(mockUser);

        expect(mocks.discord.linkDirect).toHaveBeenCalledWith(mockUser.id, '123456789', 'someone');
        expect(mocks.userAllowlist.markUsed).toHaveBeenCalledWith('entry');
      });
    });
  });

  describe('createTicket', () => {
    const dto = { action: TicketAction.DeleteRepository, repositoryId: 'repository' };

    it('should refuse a repository owned by someone else', async () => {
      mocks.repository.get.mockResolvedValue({ id: 'repository', userId: 'someone-else' } as never);

      await expect(sut.createTicket(mockAuth, dto)).rejects.toThrow(UnauthorizedException);
      expect(mocks.ticket.create).not.toHaveBeenCalled();
    });

    it('should store a pending ticket and send the browser to the IdP', async () => {
      mocks.repository.get.mockResolvedValue({ id: 'repository', userId: mockAuth.id } as never);
      mocks.crypto.randomHex.mockReturnValue('random');
      mocks.oidc.authorizeTicket.mockResolvedValue({ redirectTo: new URL('https://idp.example.test/authorize') });

      await expect(sut.createTicket(mockAuth, dto)).resolves.toEqual({
        redirectTo: 'https://idp.example.test/authorize',
      });

      expect(mocks.ticket.create).toHaveBeenCalledWith({
        token: 'random',
        oidcState: 'random',
        oidcCodeVerifier: expect.any(String),
        userId: mockAuth.id,
        repositoryId: 'repository',
        action: TicketAction.DeleteRepository,
        expiresAt: expect.any(Date),
      });
      expect(mocks.oidc.authorizeTicket).toHaveBeenCalledWith('random', expect.any(String), mockAuth.email);
    });
  });

  describe('ticketCallback', () => {
    const request = { originalUrl: '/api/auth/ticket/callback?code=code&state=state' };

    beforeEach(() => {
      mocks.ticket.getPending.mockResolvedValue(mockTicket);
      mocks.oidc.callbackTicket.mockResolvedValue({
        claims: { sub: mockUser.sub, auth_time: mockTicket.createdAt.getTime() / 1000 + 1 } as never,
        accessToken: 'access-token',
      });
      mocks.user.getBySub.mockResolvedValue(mockUser as never);
      mocks.oidc.revoke.mockResolvedValue();
    });

    it('should fail if error in URL', async () => {
      await expect(
        sut.ticketCallback({ originalUrl: '?error=abc&error_description=failure' } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"OIDC error: failure"`);
    });

    it('should fail if state is missing', async () => {
      await expect(
        sut.ticketCallback({ originalUrl: '?code=code' } as never),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"missing state"`);
    });

    it('should fail if no pending ticket matches the state', async () => {
      mocks.ticket.getPending.mockResolvedValue(void 0);

      await expect(sut.ticketCallback(request as never)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Confirmation flow has expired"`,
      );
      expect(mocks.oidc.callbackTicket).not.toHaveBeenCalled();
    });

    it('should fail if the id token carries no auth_time', async () => {
      mocks.oidc.callbackTicket.mockResolvedValue({
        claims: { sub: mockUser.sub } as never,
        accessToken: 'access-token',
      });

      await expect(sut.ticketCallback(request as never)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"no id token with auth_time received"`,
      );
    });

    it('should fail if the IdP session predates the ticket', async () => {
      mocks.oidc.callbackTicket.mockResolvedValue({
        claims: { sub: mockUser.sub, auth_time: mockTicket.createdAt.getTime() / 1000 - 60 } as never,
        accessToken: 'access-token',
      });

      await expect(sut.ticketCallback(request as never)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Session is older than ticket"`,
      );
      expect(mocks.ticket.activate).not.toHaveBeenCalled();
    });

    it('should fail if a different account confirmed', async () => {
      mocks.user.getBySub.mockResolvedValue({ ...mockUser, id: 'someone-else' } as never);

      await expect(sut.ticketCallback(request as never)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Signed in as a different account"`,
      );
      expect(mocks.ticket.activate).not.toHaveBeenCalled();
    });

    it('should activate the ticket and revoke the IdP token', async () => {
      await expect(sut.ticketCallback(request as never)).resolves.toEqual({
        token: mockTicket.token,
        redirectTo: `/tickets/${mockTicket.id}`,
      });

      expect(mocks.oidc.callbackTicket).toHaveBeenCalledWith(expect.any(URL), 'state', mockTicket.oidcCodeVerifier);
      expect(mocks.oidc.revoke).toHaveBeenCalledWith('access-token');
      expect(mocks.ticket.activate).toHaveBeenCalledWith(mockTicket.id);
    });

    it('should still activate when revocation fails', async () => {
      mocks.oidc.revoke.mockRejectedValue(new Error('revocation unavailable'));

      await expect(sut.ticketCallback(request as never)).resolves.toEqual(
        expect.objectContaining({ token: mockTicket.token }),
      );

      expect(mocks.logger.warn).toHaveBeenCalled();
      expect(mocks.ticket.activate).toHaveBeenCalledWith(mockTicket.id);
    });
  });

  describe('getTicket', () => {
    it('should fail if no active ticket matches the cookie', async () => {
      mocks.ticket.getActive.mockResolvedValue(void 0);

      await expect(sut.getTicket(mockTicket.id, {})).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Confirmation flow has expired"`,
      );
      expect(mocks.ticket.getActive).toHaveBeenCalledWith(mockTicket.id, '');
    });

    it('should return the ticket matching the cookie', async () => {
      const ticket = Symbol('Ticket');
      mocks.ticket.getActive.mockResolvedValue(ticket as never);

      await expect(sut.getTicket(mockTicket.id, { cookie: 'yucca-ticket-token=secret' })).resolves.toBe(ticket);
      expect(mocks.ticket.getActive).toHaveBeenCalledWith(mockTicket.id, 'secret');
    });
  });

  describe('spendTicket', () => {
    it('should fail if the ticket cannot be spent', async () => {
      mocks.ticket.spend.mockResolvedValue(void 0);

      await expect(
        sut.spendTicket(TicketAction.DeleteRepository, 'repository', mockTicket.id, {}),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Action 'repository.delete' has not been confirmed"`);
    });

    it('should consume the ticket bound to the action and repository', async () => {
      mocks.ticket.spend.mockResolvedValue(mockTicket);

      await expect(
        sut.spendTicket(TicketAction.DeleteRepository, 'repository', mockTicket.id, {
          cookie: 'yucca-ticket-token=secret',
        }),
      ).resolves.toBe(mockTicket);

      expect(mocks.ticket.spend).toHaveBeenCalledWith(
        mockTicket.id,
        'secret',
        TicketAction.DeleteRepository,
        'repository',
      );
    });
  });
});
