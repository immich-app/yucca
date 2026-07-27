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

describe('FeaturesController (e2e)', () => {
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

  afterEach(async () => {
    await app.close();
  });

  describe('GET /features', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/features').expect(401);
    });

    it('lists the registry with override counts', async () => {
      const user = await testUtils.createUser();
      await request(app.getHttpServer())
        .put(`/api/user/${user.id}/features/multi-consumer`)
        .set('Cookie', authCookie)
        .send({ value: true, reason: 'testing' })
        .expect(200);

      const { body } = await request(app.getHttpServer()).get('/api/features').set('Cookie', authCookie).expect(200);

      const flag = body.flags.find((f: { key: string }) => f.key === 'multi-consumer');
      expect(flag).toMatchObject({ key: 'multi-consumer', default: false, stage: 'beta', overrides: 1 });
    });
  });

  describe('PUT/DELETE /user/:id/features/:flag', () => {
    it('sets, resolves, and clears an override', async () => {
      const user = await testUtils.createUser();

      await request(app.getHttpServer())
        .put(`/api/user/${user.id}/features/multi-consumer`)
        .set('Cookie', authCookie)
        .send({ value: true, reason: 'beta cohort 1' })
        .expect(200);

      let { body } = await request(app.getHttpServer())
        .get(`/api/user/${user.id}/features`)
        .set('Cookie', authCookie)
        .expect(200);
      expect(body.features).toEqual({ 'multi-consumer': true });
      expect(body.overrides).toEqual([
        expect.objectContaining({ flag: 'multi-consumer', value: true, setBy: 'admin', reason: 'beta cohort 1' }),
      ]);

      await request(app.getHttpServer())
        .delete(`/api/user/${user.id}/features/multi-consumer`)
        .set('Cookie', authCookie)
        .expect(204);

      ({ body } = await request(app.getHttpServer())
        .get(`/api/user/${user.id}/features`)
        .set('Cookie', authCookie)
        .expect(200));
      expect(body.features).toEqual({ 'multi-consumer': false });
      expect(body.overrides).toEqual([]);
    });

    it('rejects unknown flags', async () => {
      const user = await testUtils.createUser();
      await request(app.getHttpServer())
        .put(`/api/user/${user.id}/features/not-a-flag`)
        .set('Cookie', authCookie)
        .send({ value: true })
        .expect(400);
    });
  });

  describe('POST /features/:flag/enable-batch', () => {
    it('enables the oldest users without an override first', async () => {
      const first = await testUtils.createUser({ name: 'first', createdAt: new Date('2026-01-01T00:00:00Z') });
      const second = await testUtils.createUser({ name: 'second', createdAt: new Date('2026-02-01T00:00:00Z') });
      const third = await testUtils.createUser({ name: 'third', createdAt: new Date('2026-03-01T00:00:00Z') });

      const { body } = await request(app.getHttpServer())
        .post('/api/features/multi-consumer/enable-batch')
        .set('Cookie', authCookie)
        .send({ count: 2 })
        .expect(201);

      expect(body.enabled).toHaveLength(2);
      expect(body.enabled.map((e: { userId: string }) => e.userId)).toEqual([first.id, second.id]);

      // Re-running skips already-overridden users.
      const { body: second_run } = await request(app.getHttpServer())
        .post('/api/features/multi-consumer/enable-batch')
        .set('Cookie', authCookie)
        .send({ count: 2 })
        .expect(201);
      expect(second_run.enabled.map((e: { userId: string }) => e.userId)).toEqual([third.id]);
    });

    it('lists users with overrides for a flag', async () => {
      const user = await testUtils.createUser();
      await request(app.getHttpServer())
        .put(`/api/user/${user.id}/features/multi-consumer`)
        .set('Cookie', authCookie)
        .send({ value: false, reason: 'opt-out' })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get('/api/features/multi-consumer/users')
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toEqual([
        expect.objectContaining({ userId: user.id, email: user.email, value: false, reason: 'opt-out' }),
      ]);
    });
  });
});
