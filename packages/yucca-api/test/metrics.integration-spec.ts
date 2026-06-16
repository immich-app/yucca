import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('MetricsController (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string; name: string; email: string; sub: string };
  let session: { id: string; accessToken: string };
  let repository: { id: string };

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

  describe('GET /metrics/:repositoryId/history', () => {
    it('reflects submitted metric changes in history', async () => {
      await request(app.getHttpServer())
        .post(`/api/metrics/submit/${repository.id}/backup/start`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post(`/api/metrics/submit/${repository.id}/backup/end`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ success: true, durationMs: 1234 })
        .expect(204);

      await request(app.getHttpServer())
        .patch(`/api/metrics/submit/${repository.id}/size`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ sizeBytes: 4096 })
        .expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/metrics/${repository.id}/history`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body).toEqual({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            repositoryId: repository.id,
            started: expect.any(String),
          }),
          expect.objectContaining({
            id: expect.any(String),
            repositoryId: repository.id,
            backup: expect.any(String),
            successfulBackup: expect.any(String),
            backupDuration: 1234,
          }),
          expect.objectContaining({
            id: expect.any(String),
            repositoryId: repository.id,
            sizeBytes: '4096',
          }),
        ]),
        nextCursor: null,
      });
    });

    it('pages through history with limit and cursor', async () => {
      for (const sizeBytes of [1024, 2048, 4096]) {
        await request(app.getHttpServer())
          .patch(`/api/metrics/submit/${repository.id}/size`)
          .set('Cookie', `yucca-access-token=${session.accessToken}`)
          .send({ sizeBytes })
          .expect(204);
      }

      const firstPage = await request(app.getHttpServer())
        .get(`/api/metrics/${repository.id}/history?limit=2`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.nextCursor).toEqual(expect.any(String));
      expect(firstPage.body.items.map((item: { sizeBytes: string }) => item.sizeBytes)).toEqual(['4096', '2048']);

      const secondPage = await request(app.getHttpServer())
        .get(`/api/metrics/${repository.id}/history?limit=2&cursor=${firstPage.body.nextCursor}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();
      expect(secondPage.body.items.map((item: { sizeBytes: string }) => item.sizeBytes)).toEqual(['1024']);
    });
  });

  describe('GET /repository/:id', () => {
    it('reflects submitted metric changes on the repository', async () => {
      await request(app.getHttpServer())
        .post(`/api/metrics/submit/${repository.id}/backup/end`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ success: true, durationMs: 1234 })
        .expect(204);

      await request(app.getHttpServer())
        .patch(`/api/metrics/submit/${repository.id}/size`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ sizeBytes: 4096 })
        .expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/repository/${repository.id}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body).toEqual({
        repository: {
          id: repository.id,
          userId: user.id,
          worm: false,
          name: expect.any(String),
          metrics: expect.objectContaining({
            sizeBytes: 4096,
            lastBackup: expect.any(String),
            lastSuccessfulBackup: expect.any(String),
            lastBackupDuration: 1234,
          }),
          meter: expect.any(Object),
        },
      });
    });
  });
});
