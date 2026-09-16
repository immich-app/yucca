import { MetricService } from '@common/server/otel';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OidcRepository } from 'src/repositories/oidc.repository';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

const authCookie = ['yucca-admin-sub=admin', 'yucca-admin-access-token=token'];

describe('RepositoryController (e2e)', () => {
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await testUtils.resetDatabase();
  });

  describe('GET /repository', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/repository').expect(401);
    });

    it('lists repositories with owner and metrics', async () => {
      const owner = await testUtils.createUser({ name: 'owner' });
      const repository = await testUtils.createRepository(owner.id, { name: 'Repo A' });

      const { body } = await request(app.getHttpServer()).get('/api/repository').set('Cookie', authCookie).expect(200);

      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: repository.id,
            name: 'Repo A',
            worm: false,
            user: expect.objectContaining({ id: owner.id, name: 'owner', email: owner.email }),
            metrics: expect.objectContaining({ sizeBytes: expect.anything() }),
          }),
        ]),
      );
      expect(body.nextCursor).toBeNull();
    });

    it('filters by userId', async () => {
      const owner = await testUtils.createUser();
      const other = await testUtils.createUser();
      const repository = await testUtils.createRepository(owner.id);
      await testUtils.createRepository(other.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/repository?userId=${owner.id}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(repository.id);
    });
  });

  describe('GET /repository/:id', () => {
    it('returns a repository with its owner and metrics', async () => {
      const owner = await testUtils.createUser({ name: 'owner' });
      const repository = await testUtils.createRepository(owner.id, { name: 'Repo B' });

      const { body } = await request(app.getHttpServer())
        .get(`/api/repository/${repository.id}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.repository).toEqual(
        expect.objectContaining({
          id: repository.id,
          name: 'Repo B',
          worm: false,
          user: expect.objectContaining({ id: owner.id }),
          metrics: expect.any(Object),
        }),
      );
    });
  });

  describe('PATCH /repository/:id', () => {
    it('updates the repository name', async () => {
      const owner = await testUtils.createUser();
      const repository = await testUtils.createRepository(owner.id, { name: 'Before' });

      const { body } = await request(app.getHttpServer())
        .patch(`/api/repository/${repository.id}`)
        .set('Cookie', authCookie)
        .send({ name: 'After' })
        .expect(200);

      expect(body.repository).toEqual(expect.objectContaining({ id: repository.id, name: 'After' }));
    });

    it('lets an admin disable WORM', async () => {
      const owner = await testUtils.createUser();
      const repository = await testUtils.createRepository(owner.id, { worm: true });

      const { body } = await request(app.getHttpServer())
        .patch(`/api/repository/${repository.id}`)
        .set('Cookie', authCookie)
        .send({ worm: false })
        .expect(200);

      expect(body.repository.worm).toBe(false);
    });
  });

  describe('DELETE /repository/:id', () => {
    it.todo('deletes a repository');
  });

  describe('repository queries', () => {
    it('returns metric timestamps as Date instances', async () => {
      const owner = await testUtils.createUser({ name: 'owner' });
      const repository = await testUtils.createRepository(owner.id);
      await testUtils.setRepositoryMetrics(repository.id);
      const repositories = testUtils.getRepositoryRepository();

      const row = await repositories.get(repository.id);

      expect(row.metrics.lastStarted).toBeInstanceOf(Date);
      expect(row.metrics.lastBackup).toBeInstanceOf(Date);
      expect(row.metrics.lastSuccessfulBackup).toBeInstanceOf(Date);
      expect(typeof row.metrics.sizeBytes).toBe('number');
    });

    it('returns metric timestamps as Date instances when listing', async () => {
      const owner = await testUtils.createUser({ name: 'owner' });
      const repository = await testUtils.createRepository(owner.id);
      await testUtils.setRepositoryMetrics(repository.id);

      const page = await testUtils.getRepositoryRepository().list({ limit: 10 });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].id).toBe(repository.id);
      expect(page.items[0].metrics.lastBackup).toBeInstanceOf(Date);
    });
  });
});
