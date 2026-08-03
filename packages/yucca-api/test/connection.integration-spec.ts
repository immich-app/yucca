import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('ConnectionController (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string };
  let session: { accessToken: string };
  let connection: { id: string };

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
    ({ user, session, connection } = await testUtils.createUser());
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /connections', () => {
    it('lists the default connection for everyone', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/connections').set('Cookie', cookie()).expect(200);

      expect(body.connections).toEqual([
        expect.objectContaining({ id: connection.id, type: 'immich', name: 'Immich', repositoryCount: 0 }),
      ]);
    });

    it('includes repository counts', async () => {
      await testUtils.createRepository(user.id);

      const { body } = await request(app.getHttpServer()).get('/api/connections').set('Cookie', cookie()).expect(200);
      expect(body.connections[0].repositoryCount).toBe(1);
    });
  });

  describe('POST /connections', () => {
    it('lets anyone create additional immich instances (no flag)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/connections')
        .set('Cookie', cookie())
        .send({ type: 'immich', name: 'second-server' })
        .expect(201);

      expect(body.connection).toMatchObject({ type: 'immich', name: 'second-server', repositoryCount: 0 });
    });

    it('403s creating a restic connection without connection-restic', async () => {
      await request(app.getHttpServer())
        .post('/api/connections')
        .set('Cookie', cookie())
        .send({ type: 'restic', name: 'manual' })
        .expect(403);
    });

    it('creates a restic connection when connection-restic is on', async () => {
      await testUtils.setFeatureOverride(user.id, 'connection-restic', true);

      const { body } = await request(app.getHttpServer())
        .post('/api/connections')
        .set('Cookie', cookie())
        .send({ type: 'restic', name: 'manual' })
        .expect(201);

      expect(body.connection).toMatchObject({ type: 'restic', name: 'manual', repositoryCount: 0 });
    });

    it('rejects unknown connection types', async () => {
      await request(app.getHttpServer())
        .post('/api/connections')
        .set('Cookie', cookie())
        .send({ type: 'winamp', name: 'nope' })
        .expect(400);
    });
  });

  describe('DELETE /connections/:id', () => {
    it('refuses to delete the default connection', async () => {
      await request(app.getHttpServer())
        .delete(`/api/connections/${connection.id}`)
        .set('Cookie', cookie())
        .expect(400);
    });

    it('refuses to delete a connection that owns repositories', async () => {
      const instance = await testUtils.createConnection(user.id, 'immich', 'laptop');
      await testUtils.createRepositoryForConnection(user.id, instance.id);

      await request(app.getHttpServer()).delete(`/api/connections/${instance.id}`).set('Cookie', cookie()).expect(400);
    });

    it('deletes an empty connection', async () => {
      const instance = await testUtils.createConnection(user.id, 'immich', 'laptop');

      await request(app.getHttpServer()).delete(`/api/connections/${instance.id}`).set('Cookie', cookie()).expect(204);

      const { body } = await request(app.getHttpServer()).get('/api/connections').set('Cookie', cookie()).expect(200);
      expect(body.connections).toHaveLength(1);
    });

    it("404s for other users' connections", async () => {
      const other = await testUtils.createUser('other', 'other@example.com', 'other-sub');

      await request(app.getHttpServer())
        .delete(`/api/connections/${other.connection.id}`)
        .set('Cookie', cookie())
        .expect(401);
    });
  });

  describe('POST /connections/:id/adopt', () => {
    it('re-parents default-connection repositories', async () => {
      const repository = await testUtils.createRepository(user.id);
      const instance = await testUtils.createConnection(user.id, 'immich', 'laptop');

      await request(app.getHttpServer())
        .post(`/api/connections/${instance.id}/adopt`)
        .set('Cookie', cookie())
        .send({ repositoryIds: [repository.id] })
        .expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/repository/${repository.id}`)
        .set('Cookie', cookie())
        .expect(200);
      expect(body.repository.connectionId).toBe(instance.id);
      expect(body.repository.connectionType).toBe('immich');
    });

    it('refuses to adopt from a non-default connection', async () => {
      const instanceA = await testUtils.createConnection(user.id, 'immich', 'laptop-a');
      const instanceB = await testUtils.createConnection(user.id, 'immich', 'laptop-b');
      const repository = await testUtils.createRepositoryForConnection(user.id, instanceA.id);

      await request(app.getHttpServer())
        .post(`/api/connections/${instanceB.id}/adopt`)
        .set('Cookie', cookie())
        .send({ repositoryIds: [repository.id] })
        .expect(400);
    });

    it("refuses to adopt other users' repositories", async () => {
      const other = await testUtils.createUser('other', 'other@example.com', 'other-sub');
      const foreign = await testUtils.createRepository(other.user.id);
      const instance = await testUtils.createConnection(user.id, 'immich', 'laptop');

      await request(app.getHttpServer())
        .post(`/api/connections/${instance.id}/adopt`)
        .set('Cookie', cookie())
        .send({ repositoryIds: [foreign.id] })
        .expect(401);
    });
  });
});
