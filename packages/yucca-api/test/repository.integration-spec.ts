import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('RepositoryController (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string; name: string; email: string; sub: string };
  let session: { id: string; accessToken: string };
  let repository: { id: string; connectionId: string };

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
    repository = await testUtils.createRepository(user.id);
  });

  describe('POST /repository', () => {
    it('creates a new repository', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/repository')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({
          name: 'My Repository',
          worm: false,
        })
        .expect(201);

      expect(body).toEqual({
        repository: {
          id: expect.any(String),
          userId: user.id,
          connectionId: expect.any(String),
          connectionType: 'immich',
          worm: false,
          name: 'My Repository',
          siteCode: 'local',
          storageClusterCode: 'local-dev',
          metrics: expect.any(Object),
          meter: expect.any(Object),
        },
      });
    });
  });

  describe('GET /repository/:id', () => {
    it('gets a repository by id', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/api/repository/${repository.id}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body).toEqual({
        repository: {
          id: repository.id,
          userId: user.id,
          connectionId: expect.any(String),
          connectionType: 'immich',
          worm: false,
          name: expect.any(String),
          siteCode: 'local',
          storageClusterCode: 'local-dev',
          metrics: expect.any(Object),
          meter: expect.any(Object),
        },
      });
    });
  });

  describe('GET /repository', () => {
    it('gets all repositories', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/repository')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body).toEqual({
        repositories: expect.arrayContaining([
          expect.objectContaining({
            id: repository.id,
          }),
        ]),
      });
    });
  });

  describe('PATCH /repository/:id', () => {
    it('updates a repository name', async () => {
      const { body } = await request(app.getHttpServer())
        .patch(`/api/repository/${repository.id}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(body).toEqual({
        repository: {
          id: repository.id,
          userId: user.id,
          connectionId: expect.any(String),
          connectionType: 'immich',
          worm: false,
          name: 'Updated Name',
          siteCode: 'local',
          storageClusterCode: 'local-dev',
          metrics: expect.any(Object),
          meter: expect.any(Object),
        },
      });
    });
  });

  describe('POST /repository/:id/restic', () => {
    it('generates restic URL for repository', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/api/repository/${repository.id}/restic`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(201);

      expect(body).toEqual({
        url: expect.stringMatching(
          /^rest:http:\/\/restic:[\w-]*\.[\w-]*\.[\w-]*@[\w.:]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/,
        ),
      });
    });

    it('embeds jti + connection claims and records the token', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/api/repository/${repository.id}/restic`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(201);

      const token = new URL((body.url as string).slice('rest:'.length)).password;
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;

      expect(claims).toMatchObject({
        user: user.id,
        repository: repository.id,
        writeOnce: false,
        connection: 'immich',
        jti: expect.any(String),
      });

      const row = await testUtils.getResticToken(claims.jti as string);
      expect(row).toMatchObject({
        repositoryId: repository.id,
        userId: user.id,
        connectionId: repository.connectionId,
        mintedBy: 'user',
        revokedAt: null,
      });
      expect(row!.expiresAt.getTime()).toBe((claims.exp as number) * 1000);
    });
  });

  describe('DELETE /repository/:id', () => {
    it.todo('deletes a repository');
  });
});
