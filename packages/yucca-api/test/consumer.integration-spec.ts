import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('ConsumerController (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string };
  let session: { accessToken: string };
  let consumer: { id: string };

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
    ({ user, session, consumer } = await testUtils.createUser());
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /consumers', () => {
    it('lists the default consumer even with the flag off', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/consumers').set('Cookie', cookie()).expect(200);

      expect(body.consumers).toEqual([
        expect.objectContaining({ id: consumer.id, type: 'immich', name: 'Immich', repositoryCount: 0 }),
      ]);
    });

    it('includes repository counts', async () => {
      await testUtils.createRepository(user.id);

      const { body } = await request(app.getHttpServer()).get('/api/consumers').set('Cookie', cookie()).expect(200);
      expect(body.consumers[0].repositoryCount).toBe(1);
    });
  });

  describe('POST /consumers', () => {
    it('403s when the multi-consumer flag is off', async () => {
      await request(app.getHttpServer())
        .post('/api/consumers')
        .set('Cookie', cookie())
        .send({ type: 'fubar', name: 'my-laptop' })
        .expect(403);
    });

    it('creates a consumer when the flag is on', async () => {
      await testUtils.setFeatureOverride(user.id, 'multi-consumer', true);

      const { body } = await request(app.getHttpServer())
        .post('/api/consumers')
        .set('Cookie', cookie())
        .send({ type: 'fubar', name: 'my-laptop' })
        .expect(201);

      expect(body.consumer).toMatchObject({ type: 'fubar', name: 'my-laptop', repositoryCount: 0 });
    });

    it('rejects unknown consumer types', async () => {
      await testUtils.setFeatureOverride(user.id, 'multi-consumer', true);

      await request(app.getHttpServer())
        .post('/api/consumers')
        .set('Cookie', cookie())
        .send({ type: 'winamp', name: 'nope' })
        .expect(400);
    });
  });

  describe('DELETE /consumers/:id', () => {
    beforeEach(() => testUtils.setFeatureOverride(user.id, 'multi-consumer', true));

    it('refuses to delete the default consumer', async () => {
      await request(app.getHttpServer()).delete(`/api/consumers/${consumer.id}`).set('Cookie', cookie()).expect(400);
    });

    it('refuses to delete a consumer that owns repositories', async () => {
      const fubar = await testUtils.createConsumer(user.id, 'fubar', 'laptop');
      await testUtils.createRepositoryForConsumer(user.id, fubar.id);

      await request(app.getHttpServer()).delete(`/api/consumers/${fubar.id}`).set('Cookie', cookie()).expect(400);
    });

    it('deletes an empty consumer', async () => {
      const fubar = await testUtils.createConsumer(user.id, 'fubar', 'laptop');

      await request(app.getHttpServer()).delete(`/api/consumers/${fubar.id}`).set('Cookie', cookie()).expect(204);

      const { body } = await request(app.getHttpServer()).get('/api/consumers').set('Cookie', cookie()).expect(200);
      expect(body.consumers).toHaveLength(1);
    });

    it("404s for other users' consumers", async () => {
      const other = await testUtils.createUser('other', 'other@example.com', 'other-sub');

      await request(app.getHttpServer())
        .delete(`/api/consumers/${other.consumer.id}`)
        .set('Cookie', cookie())
        .expect(401);
    });
  });

  describe('POST /consumers/:id/adopt', () => {
    beforeEach(() => testUtils.setFeatureOverride(user.id, 'multi-consumer', true));

    it('re-parents default-consumer repositories', async () => {
      const repository = await testUtils.createRepository(user.id);
      const fubar = await testUtils.createConsumer(user.id, 'fubar', 'laptop');

      await request(app.getHttpServer())
        .post(`/api/consumers/${fubar.id}/adopt`)
        .set('Cookie', cookie())
        .send({ repositoryIds: [repository.id] })
        .expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/repository/${repository.id}`)
        .set('Cookie', cookie())
        .expect(200);
      expect(body.repository.consumerId).toBe(fubar.id);
      expect(body.repository.consumerType).toBe('fubar');
    });

    it('refuses to adopt from a non-default consumer', async () => {
      const fubarA = await testUtils.createConsumer(user.id, 'fubar', 'laptop-a');
      const fubarB = await testUtils.createConsumer(user.id, 'fubar', 'laptop-b');
      const repository = await testUtils.createRepositoryForConsumer(user.id, fubarA.id);

      await request(app.getHttpServer())
        .post(`/api/consumers/${fubarB.id}/adopt`)
        .set('Cookie', cookie())
        .send({ repositoryIds: [repository.id] })
        .expect(400);
    });

    it("refuses to adopt other users' repositories", async () => {
      const other = await testUtils.createUser('other', 'other@example.com', 'other-sub');
      const foreign = await testUtils.createRepository(other.user.id);
      const fubar = await testUtils.createConsumer(user.id, 'fubar', 'laptop');

      await request(app.getHttpServer())
        .post(`/api/consumers/${fubar.id}/adopt`)
        .set('Cookie', cookie())
        .send({ repositoryIds: [foreign.id] })
        .expect(401);
    });
  });
});
