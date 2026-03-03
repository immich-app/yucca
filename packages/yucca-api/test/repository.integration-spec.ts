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

  describe('POST /auth/repository', () => {
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
          worm: false,
          name: 'My Repository',
          metrics: expect.any(Object),
        },
      });
    });
  });

  describe('GET /auth/repository', () => {
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

  describe('POST /auth/repository/:id/restic', () => {
    it('generates restic URL for repository', async () => {
      const { body } = await request(app.getHttpServer())
        .post(`/api/repository/${repository.id}/restic`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(201);

      expect(body).toEqual({
        url: expect.stringMatching(
          /^rest:http:\/\/restic:[\w-]*\.[\w-]*\.[\w-]*@localhost:3010\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/,
        ),
      });
    });
  });
});
