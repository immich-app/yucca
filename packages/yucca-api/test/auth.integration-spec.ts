import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { parse } from 'cookie';
import { firstValueFrom, ReplaySubject, skip } from 'rxjs';
import { env } from 'src/env';
import { AuthService } from 'src/services/auth.service';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let auth: AuthService;
  let user: { id: string; name: string; email: string; sub: string };
  let session: { id: string; accessToken: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports,
      controllers,
      providers: [MetricService, ...providers],
    })
      .overrideProvider(MetricService)
      .useValue(newMetricServiceMock())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('/api');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    auth = await moduleFixture.resolve(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await testUtils.resetDatabase();
    ({ user, session } = await testUtils.createUser());
  });

  describe('GET /auth', () => {
    it('fails with no auth provided', async () => {
      await request(app.getHttpServer()).get('/api/auth').expect(401);
    });

    it('responds with user details', async () => {
      await request(app.getHttpServer())
        .get('/api/auth')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200)
        .expect({
          id: user.id,
          sub: user.sub,
          name: user.name,
          email: user.email,
          sessionId: session.id,
          connectionId: null,
          features: { 'connection-restic': false },
        });
    });

    it('reflects feature overrides in the auth response', async () => {
      await testUtils.setFeatureOverride(user.id, 'connection-restic', true);

      const { body } = await request(app.getHttpServer())
        .get('/api/auth')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body.features).toEqual({ 'connection-restic': true });
    });

    it('rejects a disabled user with an existing session', async () => {
      await testUtils.disableUser(user.id);

      await request(app.getHttpServer())
        .get('/api/auth')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(401);
    });
  });

  describe('GET /auth/logout', () => {
    it('fails if not authenticated', async () => {
      await request(app.getHttpServer()).get('/api/auth/logout').expect(401);
    });

    it('redirects to IdP logout', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/logout')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(302);

      expect(header.location).toEqual(expect.stringContaining(env.OIDC_ISSUER.href));
    });

    it('IdP redirects us back', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/logout')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(302)
        .redirects(1);

      expect(header.location).toBe(env.OIDC_LOGOUT_REDIRECT_URI);
    });
  });

  describe('GET /auth/oidc/login', () => {
    it('redirects to IdP', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/oidc/login')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(302);

      expect(header['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('yucca-oidc-state='),
          expect.stringContaining('yucca-oidc-code-verifier='),
        ]),
      );

      expect(header.location).toEqual(expect.stringContaining(env.OIDC_ISSUER.href));
    });

    it('redirects to redirect_uri after IdP', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/oidc/login?redirect_uri=http://example.com')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(302);

      const redirectUrl = new URL(header.location);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', 'bar');

      const { headers } = await fetch(redirectUrl, {
        redirect: 'manual',
      });

      const callbackUrl = headers.get('location')!;
      expect(callbackUrl).toEqual(expect.stringContaining('http://localhost:36033'));
    });
  });

  describe('GET /auth/oidc/callback', () => {
    it('should create user if not exists', async () => {
      await expect(testUtils.getUserBySub('bar')).resolves.toBeUndefined();

      const { header } = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);
      const cookies = parse((header['set-cookie'] as never as string[]).join('; '));

      const redirectUrl = new URL(header.location);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', 'bar');

      const { headers } = await fetch(redirectUrl, {
        redirect: 'manual',
      });

      const callbackUrl = new URL(headers.get('location')!);

      const { header: authHeader } = await request(app.getHttpServer())
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', [
          `yucca-oidc-state=${cookies['yucca-oidc-state']}`,
          `yucca-oidc-code-verifier=${cookies['yucca-oidc-code-verifier']}`,
        ])
        .expect(302);

      expect(authHeader['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('yucca-access-token')]));
      await expect(testUtils.getUserBySub('bar')).resolves.toBeTruthy();
    });

    it('should log into existing user', async () => {
      const { header } = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);
      const cookies = parse((header['set-cookie'] as never as string[]).join('; '));

      const redirectUrl = new URL(header.location);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', 'foo');

      const { headers } = await fetch(redirectUrl, {
        redirect: 'manual',
      });

      const callbackUrl = new URL(headers.get('location')!);

      const { header: authHeader } = await request(app.getHttpServer())
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', [
          `yucca-oidc-state=${cookies['yucca-oidc-state']}`,
          `yucca-oidc-code-verifier=${cookies['yucca-oidc-code-verifier']}`,
        ])
        .expect(302);

      expect(authHeader['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('yucca-access-token')]));

      const authCookies = parse((authHeader['set-cookie'] as never as string[]).join('; '));
      await expect(testUtils.getUserByAccessToken(authCookies['yucca-access-token']!)).resolves.toEqual(
        expect.objectContaining({
          id: user.id,
        }),
      );
    });

    it('refuses to log in a disabled user', async () => {
      await testUtils.disableUser(user.id);

      const { header } = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);
      const cookies = parse((header['set-cookie'] as never as string[]).join('; '));

      const redirectUrl = new URL(header.location);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', user.sub);

      const { headers } = await fetch(redirectUrl, {
        redirect: 'manual',
      });

      const callbackUrl = new URL(headers.get('location')!);

      await request(app.getHttpServer())
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', [
          `yucca-oidc-state=${cookies['yucca-oidc-state']}`,
          `yucca-oidc-code-verifier=${cookies['yucca-oidc-code-verifier']}`,
        ])
        .expect(401);
    });
  });

  describe('beta allowlist', () => {
    let allowedEmailDomains: string[];

    beforeEach(() => {
      allowedEmailDomains = env.ALLOWED_EMAIL_DOMAINS;
      env.ALLOWED_EMAIL_DOMAINS = [];
    });

    afterEach(() => {
      env.ALLOWED_EMAIL_DOMAINS = allowedEmailDomains;
    });

    const loginCallback = async (sub: string, inviteCode?: string) => {
      const loginPath = inviteCode ? `/api/auth/oidc/login?invite_code=${inviteCode}` : '/api/auth/oidc/login';
      const { header } = await request(app.getHttpServer()).get(loginPath).expect(302);
      const cookies = parse((header['set-cookie'] as never as string[]).join('; '));

      const redirectUrl = new URL(header.location);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', sub);

      const { headers } = await fetch(redirectUrl, {
        redirect: 'manual',
      });

      const callbackUrl = new URL(headers.get('location')!);

      const cookieHeader = [
        `yucca-oidc-state=${cookies['yucca-oidc-state']}`,
        `yucca-oidc-code-verifier=${cookies['yucca-oidc-code-verifier']}`,
      ];
      if (cookies['yucca-invite-code']) {
        cookieHeader.push(`yucca-invite-code=${cookies['yucca-invite-code']}`);
      }

      return request(app.getHttpServer())
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', cookieHeader);
    };

    it('redirects a non-allowlisted new user to the invite page', async () => {
      const response = await loginCallback('blocked-user');

      expect(response.status).toBe(302);
      expect(response.header.location).toBe('/login/invite?error=not_allowed');
      await expect(testUtils.getUserBySub('blocked-user')).resolves.toBeUndefined();
    });

    it('allows a new user whose email domain is allowed', async () => {
      env.ALLOWED_EMAIL_DOMAINS = ['example.test'];

      const response = await loginCallback('domain-user');

      expect(response.status).toBe(302);
      expect(response.header.location).toBe('/');
      await expect(testUtils.getUserBySub('domain-user')).resolves.toBeTruthy();
    });

    it('allows an invited email and marks the entry used', async () => {
      await testUtils.createAllowlistEntry({ email: 'allowed-user@example.test' });

      const response = await loginCallback('allowed-user');

      expect(response.status).toBe(302);
      expect(response.header.location).toBe('/');
      await expect(testUtils.getUserBySub('allowed-user')).resolves.toBeTruthy();
      await expect(testUtils.getAllowlistEntry('allowed-user@example.test')).resolves.toEqual(
        expect.objectContaining({ inviteUsed: true, inviteUsedAt: expect.any(Date) }),
      );
    });

    it('blocks a staged (not yet invited) email', async () => {
      await testUtils.createAllowlistEntry({ email: 'staged-user@example.test', invited: false });

      const response = await loginCallback('staged-user');

      expect(response.status).toBe(302);
      expect(response.header.location).toBe('/login/invite?error=not_allowed');
      await expect(testUtils.getUserBySub('staged-user')).resolves.toBeUndefined();
    });

    it('redeems an invite code for a different email', async () => {
      await testUtils.createAllowlistEntry({ email: 'invitee@example.com', inviteCode: 'REDEEMME01' });

      const response = await loginCallback('code-user', 'redeemme01');

      expect(response.status).toBe(302);
      expect(response.header.location).toBe('/');
      await expect(testUtils.getUserBySub('code-user')).resolves.toBeTruthy();
      await expect(testUtils.getAllowlistEntry('invitee@example.com')).resolves.toEqual(
        expect.objectContaining({ inviteUsed: true }),
      );
    });

    it('rejects an already-used invite code', async () => {
      await testUtils.createAllowlistEntry({ email: 'used@example.com', inviteCode: 'USEDCODE01' });

      await loginCallback('first-code-user', 'USEDCODE01');
      const response = await loginCallback('second-code-user', 'USEDCODE01');

      expect(response.status).toBe(302);
      expect(response.header.location).toBe('/login/invite?error=not_allowed');
      await expect(testUtils.getUserBySub('second-code-user')).resolves.toBeUndefined();
    });
  });

  describe('ticket confirmation flow', () => {
    let repository: { id: string; name: string };

    beforeEach(async () => {
      repository = await testUtils.createRepository(user.id);
    });

    const startTicket = (accessToken: string, repositoryId: string) =>
      request(app.getHttpServer())
        .post('/api/auth/ticket')
        .set('Cookie', `yucca-access-token=${accessToken}`)
        .send({ action: 'repository.delete', repositoryId });

    const confirmAtIdp = async (redirectTo: string, sub: string) => {
      const redirectUrl = new URL(redirectTo);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', sub);

      const { headers } = await fetch(redirectUrl, { redirect: 'manual' });
      const callbackUrl = new URL(headers.get('location')!);

      return callbackUrl.pathname + callbackUrl.search;
    };

    const confirmedTicket = async () => {
      const { body } = await startTicket(session.accessToken, repository.id).expect(201);
      const callbackPath = await confirmAtIdp(body.redirectTo, user.sub);
      const { header } = await request(app.getHttpServer()).get(callbackPath).expect(302);
      const cookies = parse((header['set-cookie'] as never as string[]).join('; '));
      const token = cookies['yucca-ticket-token']!;
      const ticket = await testUtils.getTicketByToken(token);

      return { id: ticket!.id, token, location: header.location as string };
    };

    describe('POST /auth/ticket', () => {
      it('fails if not authenticated', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/ticket')
          .send({ action: 'repository.delete', repositoryId: repository.id })
          .expect(401);
      });

      it('refuses a repository owned by someone else', async () => {
        const other = await testUtils.createUser('other', 'other@example.com', 'other');

        await startTicket(other.session.accessToken, repository.id).expect(401);
      });

      it('rejects an unknown action', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/ticket')
          .set('Cookie', `yucca-access-token=${session.accessToken}`)
          .send({ action: 'repository.explode', repositoryId: repository.id })
          .expect(400);
      });

      it('sends the browser to the IdP demanding a fresh login', async () => {
        const { body } = await startTicket(session.accessToken, repository.id).expect(201);

        const redirectTo = new URL(body.redirectTo);
        expect(redirectTo.href).toEqual(expect.stringContaining(env.OIDC_ISSUER.href));
        expect(redirectTo.searchParams.get('prompt')).toBe('login');
        expect(redirectTo.searchParams.get('max_age')).toBe('0');
        expect(redirectTo.searchParams.get('login_hint')).toBe(user.email);
        expect(redirectTo.searchParams.get('redirect_uri')).toBe(env.OIDC_TICKET_REDIRECT_URI);
      });
    });

    describe('GET /auth/ticket/callback', () => {
      it('rejects an unknown state', async () => {
        await request(app.getHttpServer()).get('/api/auth/ticket/callback?code=code&state=unknown').expect(400);
      });

      it('rejects confirmation by a different account', async () => {
        const { body } = await startTicket(session.accessToken, repository.id).expect(201);
        const callbackPath = await confirmAtIdp(body.redirectTo, 'someone-else');

        await request(app.getHttpServer()).get(callbackPath).expect(401);
        await expect(testUtils.getPendingTicket(repository.id)).resolves.toBeTruthy();
      });

      it('activates the ticket and hands the browser its token', async () => {
        const ticket = await confirmedTicket();

        await expect(testUtils.getTicketByToken(ticket.token)).resolves.toEqual(
          expect.objectContaining({
            id: ticket.id,
            userId: user.id,
            repositoryId: repository.id,
            action: 'repository.delete',
            validAt: expect.any(Date),
            consumedAt: null,
          }),
        );
        expect(ticket.location).toBe(`/tickets/${ticket.id}`);
      });

      it('refuses to replay a callback', async () => {
        const { body } = await startTicket(session.accessToken, repository.id).expect(201);
        const callbackPath = await confirmAtIdp(body.redirectTo, user.sub);

        await request(app.getHttpServer()).get(callbackPath).expect(302);
        await request(app.getHttpServer()).get(callbackPath).expect(400);
      });
    });

    describe('GET /auth/ticket/:id', () => {
      it('fails without the ticket token cookie', async () => {
        const ticket = await confirmedTicket();

        await request(app.getHttpServer())
          .get(`/api/auth/ticket/${ticket.id}`)
          .set('Cookie', `yucca-access-token=${session.accessToken}`)
          .expect(400);
      });

      it('fails for a ticket that was never confirmed', async () => {
        await startTicket(session.accessToken, repository.id).expect(201);
        const pending = await testUtils.getPendingTicket(repository.id);

        await request(app.getHttpServer())
          .get(`/api/auth/ticket/${pending!.id}`)
          .set('Cookie', `yucca-ticket-token=${pending!.token}`)
          .expect(400);
      });

      it('describes the confirmed action and its repository', async () => {
        const ticket = await confirmedTicket();

        const { body } = await request(app.getHttpServer())
          .get(`/api/auth/ticket/${ticket.id}`)
          .set('Cookie', `yucca-ticket-token=${ticket.token}`)
          .expect(200);

        expect(body).toEqual({
          id: ticket.id,
          action: 'repository.delete',
          repositoryId: repository.id,
          repositoryName: repository.name,
          metrics: expect.any(Object),
          meter: expect.any(Object),
        });
      });
    });
  });

  describe('GET /auth/oidc/device (SSE)', () => {
    it('completes device flow and creates user', async () => {
      const replay = new ReplaySubject<MessageEvent>();
      const subscription = auth.oidcDeviceFlowObservable().subscribe(replay);

      try {
        const startMessage = await firstValueFrom(replay);
        const start = startMessage.data as { type: string; userCode: string; verificationUri: string };
        expect(start).toEqual({
          type: 'START',
          userCode: expect.any(String),
          verificationUri: expect.any(String),
        });

        const approveUrl = new URL('/api/form/device', env.OIDC_DEVICE_ISSUER);
        approveUrl.searchParams.set('user_code', start.userCode);
        approveUrl.searchParams.set('sub', 'device-flow-user');
        await fetch(approveUrl);

        const successMessage = await firstValueFrom(replay.pipe(skip(1)));
        const success = successMessage.data as { type: string; accessToken: string; userId: string };
        expect(success).toEqual({
          type: 'SUCCESS',
          accessToken: expect.any(String),
          userId: expect.any(String),
        });

        await expect(testUtils.getUserBySub('device-flow-user')).resolves.toBeTruthy();
        await expect(testUtils.getUserByAccessToken(success.accessToken)).resolves.toEqual(
          expect.objectContaining({ sub: 'device-flow-user' }),
        );
      } finally {
        subscription.unsubscribe();
      }
    }, 15_000);
  });
});
