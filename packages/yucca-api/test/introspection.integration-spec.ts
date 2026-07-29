import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { env } from 'src/env';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

// The service-to-service token introspection michael calls on cache miss.
describe('IntrospectionController (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string };
  let session: { accessToken: string };

  const secret = env.TOKEN_INTROSPECTION_SECRET!;
  const cookie = () => `yucca-access-token=${session.accessToken}`;

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

  afterEach(async () => {
    await app.close();
  });

  const mintToken = async () => {
    await testUtils.setFeatureOverride(user.id, 'connection-restic', true);
    const { body } = await request(app.getHttpServer())
      .post('/api/connections/restic')
      .set('Cookie', cookie())
      .send({})
      .expect(201);
    return body as { jti: string; repository: { id: string } };
  };

  const introspect = (jti: string, withSecret = secret) =>
    request(app.getHttpServer()).get(`/api/internal/restic-tokens/${jti}`).set('x-introspection-secret', withSecret);

  it('requires the shared secret', async () => {
    const { jti } = await mintToken();

    await request(app.getHttpServer()).get(`/api/internal/restic-tokens/${jti}`).expect(401);
    await introspect(jti, 'wrong-secret').expect(401);
  });

  it('answers active for a live token and inactive after revoke', async () => {
    const { jti } = await mintToken();

    const { body: live } = await introspect(jti).expect(200);
    expect(live).toEqual({ active: true });

    await request(app.getHttpServer()).delete(`/api/restic-tokens/${jti}`).set('Cookie', cookie()).expect(204);

    const { body: revoked } = await introspect(jti).expect(200);
    expect(revoked).toEqual({ active: false });
  });

  it('answers inactive for unknown and malformed jtis alike', async () => {
    const { body: unknown } = await introspect('3f1f0d05-9a48-4a9e-8fb2-6f19f3f5f2aa').expect(200);
    expect(unknown).toEqual({ active: false });

    const { body: malformed } = await introspect('not-a-uuid').expect(200);
    expect(malformed).toEqual({ active: false });
  });

  it('answers inactive when the owner is disabled', async () => {
    const { jti } = await mintToken();
    await testUtils.disableUser(user.id);

    const { body } = await introspect(jti).expect(200);
    expect(body).toEqual({ active: false });
  });

  it('answers inactive for an expired token', async () => {
    const { jti } = await mintToken();
    await testUtils.expireResticToken(jti);

    const { body } = await introspect(jti).expect(200);
    expect(body).toEqual({ active: false });
  });
});
