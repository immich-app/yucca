import { LoggerRepository, MetricService } from '@common/server/otel';
import { INestApplication } from '@nestjs/common';
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

  beforeAll(async () => {
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await testUtils.resetDatabase();
    ({ user, session } = await testUtils.createUser());
    repository = await testUtils.createRepository(user.id);
  });

  describe('POST /metrics/submit/log', () => {
    let loggerInfo: jest.SpyInstance;

    beforeEach(() => {
      loggerInfo = jest.spyOn(app.get(LoggerRepository), 'info');
    });

    afterEach(() => {
      loggerInfo.mockRestore();
    });

    it('forwards a structured log to the logger', async () => {
      await request(app.getHttpServer())
        .post('/api/metrics/submit/log')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ summary: 'backup finished', data: { files: 3 } })
        .expect(204);

      expect(loggerInfo).toHaveBeenCalledWith({
        _msg: '[telemetry] backup finished',
        customerId: user.id,
        data: { files: 3 },
      });
    });

    it.each([{}, { summary: 'backup finished' }, { summary: 'backup finished', data: 'files' }])(
      'rejects an invalid body %j',
      async (dto) => {
        await request(app.getHttpServer())
          .post('/api/metrics/submit/log')
          .set('Cookie', `yucca-access-token=${session.accessToken}`)
          .send(dto)
          .expect(400);

        expect(loggerInfo).not.toHaveBeenCalledWith(expect.objectContaining({ customerId: user.id }));
      },
    );

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/api/metrics/submit/log')
        .send({ summary: 'backup finished', data: {} })
        .expect(401);

      expect(loggerInfo).not.toHaveBeenCalledWith(expect.objectContaining({ _msg: '[telemetry] backup finished' }));
    });
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
        .send({ status: 'complete', durationMs: 1234 })
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
            backupStatus: 'complete',
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

    it('records a cancelled backup in history', async () => {
      await request(app.getHttpServer())
        .post(`/api/metrics/submit/${repository.id}/backup/end`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ status: 'cancelled', durationMs: 1234 })
        .expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/metrics/${repository.id}/history`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body).toEqual({
        items: [
          expect.objectContaining({
            repositoryId: repository.id,
            backup: expect.any(String),
            backupStatus: 'cancelled',
            backupDuration: 1234,
          }),
        ],
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
        .send({ status: 'complete', durationMs: 1234 })
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
          connectionId: expect.any(String),
          connectionType: 'immich',
          worm: false,
          name: expect.any(String),
          siteCode: 'local',
          storageClusterCode: 'local-dev',
          metrics: expect.objectContaining({
            sizeBytes: 4096,
            lastBackup: expect.any(String),
            lastBackupStatus: 'complete',
            lastBackupDuration: 1234,
          }),
          meter: expect.any(Object),
        },
      });
    });

    it('reflects a cancelled backup on the repository', async () => {
      await request(app.getHttpServer())
        .post(`/api/metrics/submit/${repository.id}/backup/end`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ status: 'cancelled', durationMs: 1234 })
        .expect(204);

      const { body } = await request(app.getHttpServer())
        .get(`/api/repository/${repository.id}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(200);

      expect(body.repository.metrics).toEqual(
        expect.objectContaining({
          lastBackup: expect.any(String),
          lastBackupStatus: 'cancelled',
          lastBackupDuration: 1234,
        }),
      );
    });
  });
});
