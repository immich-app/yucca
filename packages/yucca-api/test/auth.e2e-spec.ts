import { env } from '@common/server/env';
import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { parse } from 'cookie';
import { calculatePKCECodeChallenge, randomPKCECodeVerifier } from 'openid-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
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
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(200)
        .expect({
          id: user.id,
          sub: user.sub,
          name: user.name,
          email: user.email,
          sessionId: session.id,
        });
    });
  });

  describe('GET /auth/logout', () => {
    it('fails if not authenticated', async () => {
      await request(app.getHttpServer()).get('/api/auth/logout').expect(401);
    });

    it('redirects to IdP logout', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/logout')
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302);

      expect(header.location).toEqual(expect.stringContaining(env.OIDC_ISSUER.href));
    });

    it('IdP redirects us back', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/logout')
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302)
        .redirects(1);

      expect(header.location).toBe(env.OIDC_LOGOUT_REDIRECT_URI);
    });
  });

  describe('GET /auth/oidc', () => {
    it('redirects to IdP', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/oidc/login')
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302);

      expect(header['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('oidc-state='),
          expect.stringContaining('oidc-code-verifier='),
        ]),
      );

      expect(header.location).toEqual(expect.stringContaining(env.OIDC_ISSUER.href));
    });
  });

  describe('GET /auth/callback', () => {
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
        .set('Cookie', [`oidc-state=${cookies['oidc-state']}`, `oidc-code-verifier=${cookies['oidc-code-verifier']}`])
        .expect(302);

      expect(authHeader['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('access-token')]));
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
        .set('Cookie', [`oidc-state=${cookies['oidc-state']}`, `oidc-code-verifier=${cookies['oidc-code-verifier']}`])
        .expect(302);

      expect(authHeader['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('access-token')]));

      const authCookies = parse((authHeader['set-cookie'] as never as string[]).join('; '));
      await expect(testUtils.getUserByAccessToken(authCookies['access-token']!)).resolves.toEqual(
        expect.objectContaining({
          id: user.id,
        }),
      );
    });
  });

  describe('GET /auth/app/login', () => {
    it('redirects to IdP if logged out', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/app/login?code_challenge=my-pkce-challenge')
        .expect(302);

      expect(header['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('app-code-challenge=my-pkce-challenge'),
          expect.stringContaining('oidc-login-flow=app'),
        ]),
      );

      expect(header.location).toEqual('/api/auth/oidc/login');
    });

    it('redirects to app if logged in', async () => {
      const { header } = await request(app.getHttpServer())
        .get('/api/auth/app/login?code_challenge=my-pkce-challenge')
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302);

      expect(header['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining('app-code-challenge=my-pkce-challenge')]),
      );

      expect(header.location).toEqual('/login/grant');
    });
  });

  describe('POST /auth/app/callback', () => {
    it('redirects to app', async () => {
      const { header: loginHeader } = await request(app.getHttpServer())
        .get('/api/auth/app/login?code_challenge=my-pkce-challenge')
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302);

      const { header } = await request(app.getHttpServer())
        .post('/api/auth/app/callback')
        .set('Cookie', `access-token=${session.accessToken}; ${loginHeader['set-cookie']}`)
        .expect(302);

      expect(header.location).toEqual(expect.stringContaining('http://localhost:22676/api/auth/callback?code='));
    });
  });

  describe('POST /auth/app/token', () => {
    it('generates a new access token', async () => {
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

      const { header: loginHeader } = await request(app.getHttpServer())
        .get(`/api/auth/app/login?code_challenge=${codeChallenge}`)
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302);

      const { header: callbackHeader } = await request(app.getHttpServer())
        .post('/api/auth/app/callback')
        .set('Cookie', `access-token=${session.accessToken}; ${loginHeader['set-cookie']}`)
        .expect(302);

      const url = new URL(callbackHeader.location);

      const { body } = await request(app.getHttpServer())
        .post('/api/auth/app/token')
        .send({
          codeVerifier,
          code: url.searchParams.get('code'),
        })
        .expect(201);

      expect(body).toEqual(
        expect.objectContaining({
          accessToken: expect.any(String),
        }),
      );
    });

    it('fails PKCE if wrong verifier', async () => {
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

      const { header: loginHeader } = await request(app.getHttpServer())
        .get(`/api/auth/app/login?code_challenge=${codeChallenge}`)
        .set('Cookie', `access-token=${session.accessToken}`)
        .expect(302);

      const { header: callbackHeader } = await request(app.getHttpServer())
        .post('/api/auth/app/callback')
        .set('Cookie', `access-token=${session.accessToken}; ${loginHeader['set-cookie']}`)
        .expect(302);

      const url = new URL(callbackHeader.location);

      await request(app.getHttpServer())
        .post('/api/auth/app/token')
        .send({
          codeVerifier: 'BAD TOKEN',
          code: url.searchParams.get('code'),
        })
        .expect(400);
    });

    it('fails if missing code', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/app/token')
        .send({
          codeVerifier: 'BAD TOKEN',
          code: 'BAD CODE',
        })
        .expect(500);
    });
  });
});
