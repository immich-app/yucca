import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricService } from '@common/server/otel';
import { DatabaseRepository } from 'src/repositories/database.repository';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from './../src/app.module';
import { newMetricServiceMock } from './mocks';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

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
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.get(DatabaseRepository).shutdown();
  });

  describe('GET /', () => {
    it('responds "Hello, World!"', async () => {
      await request(app.getHttpServer()).get('/').expect(200).expect('Hello, World!');
    });
  });
});
