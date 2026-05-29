import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { parse } from 'cookie';
import { env } from 'src/env';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  const loginAs = async (sub: string) => {
    const { header } = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);
    const stateCookies = parse((header['set-cookie'] as never as string[]).join('; '));

    const redirectUrl = new URL(header.location);
    redirectUrl.pathname = '/api/form';
    redirectUrl.searchParams.set('sub', sub);

    const { headers } = await fetch(redirectUrl, { redirect: 'manual' });
    const callbackUrl = new URL(headers.get('location')!);

    const { header: authHeader } = await request(app.getHttpServer())
      .get(callbackUrl.pathname + callbackUrl.search)
      .set('Cookie', [
        `yucca-admin-oidc-state=${stateCookies['yucca-admin-oidc-state']}`,
        `yucca-admin-oidc-code-verifier=${stateCookies['yucca-admin-oidc-code-verifier']}`,
      ])
      .expect(302);

    const authCookies = parse((authHeader['set-cookie'] as never as string[]).join('; '));
    return {
      sub: authCookies['yucca-admin-sub']!,
      accessToken: authCookies['yucca-admin-access-token']!,
      cookies: [
        `yucca-admin-sub=${authCookies['yucca-admin-sub']}`,
        `yucca-admin-access-token=${authCookies['yucca-admin-access-token']}`,
      ],
    };
  };

  describe('GET /auth', () => {
    it('fails with no auth provided', async () => {
      await request(app.getHttpServer()).get('/api/auth').expect(401);
    });

    it('responds with the authenticated sub', async () => {
      const { sub, cookies } = await loginAs('admin-user');

      await request(app.getHttpServer()).get('/api/auth').set('Cookie', cookies).expect(200).expect({ sub });
    });
  });

  describe('GET /auth/logout', () => {
    it('fails if not authenticated', async () => {
      await request(app.getHttpServer()).get('/api/auth/logout').expect(401);
    });

    it('clears the auth cookies and redirects to the IdP end-session endpoint', async () => {
      const { cookies } = await loginAs('admin-user');

      const { header } = await request(app.getHttpServer()).get('/api/auth/logout').set('Cookie', cookies).expect(302);

      expect(header['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('yucca-admin-sub=;'),
          expect.stringContaining('yucca-admin-access-token=;'),
        ]),
      );
      expect(header.location).toEqual(expect.stringContaining(env.OIDC_ADMIN_ISSUER.href));
    });
  });

  describe('GET /auth/oidc/login', () => {
    it('redirects to IdP with state cookies', async () => {
      const { header } = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);

      expect(header['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('yucca-admin-oidc-state='),
          expect.stringContaining('yucca-admin-oidc-code-verifier='),
        ]),
      );

      expect(header.location).toEqual(expect.stringContaining(env.OIDC_ADMIN_ISSUER.href));
    });
  });

  describe('GET /auth/oidc/callback', () => {
    it('sets sub and access-token cookies after a successful OIDC flow', async () => {
      const { header } = await request(app.getHttpServer()).get('/api/auth/oidc/login').expect(302);
      const stateCookies = parse((header['set-cookie'] as never as string[]).join('; '));

      const redirectUrl = new URL(header.location);
      redirectUrl.pathname = '/api/form';
      redirectUrl.searchParams.set('sub', 'admin-user');

      const { headers } = await fetch(redirectUrl, { redirect: 'manual' });
      const callbackUrl = new URL(headers.get('location')!);

      const { header: authHeader } = await request(app.getHttpServer())
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', [
          `yucca-admin-oidc-state=${stateCookies['yucca-admin-oidc-state']}`,
          `yucca-admin-oidc-code-verifier=${stateCookies['yucca-admin-oidc-code-verifier']}`,
        ])
        .expect(302);

      expect(authHeader['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('yucca-admin-sub=admin-user'),
          expect.stringContaining('yucca-admin-access-token='),
        ]),
      );
    });
  });
});
