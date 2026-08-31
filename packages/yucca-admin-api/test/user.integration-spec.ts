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

describe('UserController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await testUtils.resetDatabase();
  });

  describe('GET /user', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/user').expect(401);
    });

    it('lists users', async () => {
      const alice = await testUtils.createUser({ name: 'alice' });
      const bob = await testUtils.createUser({ name: 'bob' });

      const { body } = await request(app.getHttpServer()).get('/api/user').set('Cookie', authCookie).expect(200);

      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: alice.id, name: 'alice', disabled: false }),
          expect.objectContaining({ id: bob.id, name: 'bob' }),
        ]),
      );
      expect(body.nextCursor).toBeNull();
    });

    it('paginates with limit and returns a cursor', async () => {
      await testUtils.createUser();
      await testUtils.createUser();
      await testUtils.createUser();

      const { body } = await request(app.getHttpServer())
        .get('/api/user?limit=2')
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toEqual(expect.any(String));

      const { body: page2 } = await request(app.getHttpServer())
        .get(`/api/user?limit=2&cursor=${body.nextCursor}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('GET /user/:id', () => {
    it('returns a single user', async () => {
      const user = await testUtils.createUser({ name: 'carol' });

      const { body } = await request(app.getHttpServer())
        .get(`/api/user/${user.id}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(body).toEqual({
        discordLink: null,
        user: {
          id: user.id,
          sub: user.sub,
          name: 'carol',
          email: user.email,
          disabled: false,
          createdAt: expect.any(String),
        },
      });
    });
  });

  describe('PATCH /user/:id', () => {
    it('disables a user and revokes their sessions', async () => {
      const user = await testUtils.createUser();
      const session = await testUtils.createSession(user.id);

      const { body } = await request(app.getHttpServer())
        .patch(`/api/user/${user.id}`)
        .set('Cookie', authCookie)
        .send({ disabled: true })
        .expect(200);

      expect(body.user).toEqual(expect.objectContaining({ id: user.id, disabled: true }));
      await expect(testUtils.getSession(session.id)).resolves.toBeUndefined();
    });

    it('re-enables a disabled user', async () => {
      const user = await testUtils.createUser({ disabled: true });

      const { body } = await request(app.getHttpServer())
        .patch(`/api/user/${user.id}`)
        .set('Cookie', authCookie)
        .send({ disabled: false })
        .expect(200);

      expect(body.user.disabled).toBe(false);
    });
  });

  describe('DELETE /user/:id', () => {
    it('deletes a user with no repositories', async () => {
      const user = await testUtils.createUser();

      await request(app.getHttpServer()).delete(`/api/user/${user.id}`).set('Cookie', authCookie).expect(204);
      await expect(testUtils.getUser(user.id)).resolves.toBeUndefined();
    });

    it('refuses to delete a user that still owns repositories', async () => {
      const user = await testUtils.createUser();
      await testUtils.createRepository(user.id);

      await request(app.getHttpServer()).delete(`/api/user/${user.id}`).set('Cookie', authCookie).expect(409);
      await expect(testUtils.getUser(user.id)).resolves.toBeTruthy();
    });
  });
});
