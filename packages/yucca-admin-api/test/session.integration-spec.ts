import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OidcRepository } from 'src/repositories/oidc.repository';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

const authCookie = ['yucca-admin-sub=admin', 'yucca-admin-access-token=token'];

describe('Sessions (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports,
      controllers,
      providers: [MetricService, ...providers],
    })
      .overrideProvider(MetricService)
      .useValue(newMetricServiceMock())
      .overrideProvider(OidcRepository)
      .useValue({ onModuleInit: jest.fn(), fetchUserInfo: jest.fn().mockResolvedValue({ sub: 'admin' }) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('/api');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    await testUtils.resetDatabase();
  });

  describe('GET /user/:userId/session', () => {
    it('requires authentication', async () => {
      const user = await testUtils.createUser();
      await request(app.getHttpServer()).get(`/api/user/${user.id}/session`).expect(401);
    });

    it("lists a user's sessions without leaking access tokens", async () => {
      const user = await testUtils.createUser();
      const first = await testUtils.createSession(user.id);
      const second = await testUtils.createSession(user.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/user/${user.id}/session`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toEqual(
        expect.arrayContaining([
          { id: first.id, userId: user.id },
          { id: second.id, userId: user.id },
        ]),
      );
      expect(body.items[0]).not.toHaveProperty('accessToken');
    });
  });

  describe('DELETE /session/:id', () => {
    it('revokes a single session', async () => {
      const user = await testUtils.createUser();
      const session = await testUtils.createSession(user.id);

      await request(app.getHttpServer()).delete(`/api/session/${session.id}`).set('Cookie', authCookie).expect(204);
      await expect(testUtils.getSession(session.id)).resolves.toBeUndefined();
    });
  });

  describe('DELETE /user/:userId/session', () => {
    it("revokes all of a user's sessions", async () => {
      const user = await testUtils.createUser();
      await testUtils.createSession(user.id);
      await testUtils.createSession(user.id);

      await request(app.getHttpServer()).delete(`/api/user/${user.id}/session`).set('Cookie', authCookie).expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/user/${user.id}/session`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toEqual([]);
    });
  });
});
