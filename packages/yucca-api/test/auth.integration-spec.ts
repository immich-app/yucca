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

  beforeEach(async () => {
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
        });
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
        const success = successMessage.data as { type: string; accessToken: string };
        expect(success).toEqual({
          type: 'SUCCESS',
          accessToken: expect.any(String),
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
