import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { env } from 'src/env';
import { OidcRepository } from 'src/repositories/oidc.repository';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

const authCookie = ['yucca-admin-sub=admin', 'yucca-admin-access-token=token'];

const connectRedis = async (): Promise<Redis | null> => {
  if (!env.REDIS_URL) {
    return null;
  }
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 1000, lazyConnect: true });
  try {
    await client.connect();
    await client.ping();
    return client;
  } catch {
    client.disconnect();
    return null;
  }
};

describe('ResticTokenController (e2e)', () => {
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

  const mintForNewRepository = async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/api/repository')
      .set('Cookie', authCookie)
      .send({ name: 'token-test' })
      .expect(201);

    const { body } = await request(app.getHttpServer())
      .post(`/api/repository/${created.repository.id}/url`)
      .set('Cookie', authCookie)
      .send({ expiresIn: '2d', label: 'integration' })
      .expect(201);

    return { repository: created.repository, minted: body };
  };

  describe('POST /repository/:id/url', () => {
    it('returns jti + expiresAt and records the token', async () => {
      const { repository, minted } = await mintForNewRepository();

      expect(minted).toEqual({
        url: expect.stringMatching(/^rest:/),
        jti: expect.any(String),
        expiresAt: expect.any(String),
      });

      const row = await testUtils.getResticToken(minted.jti);
      expect(row).toMatchObject({
        repositoryId: repository.id,
        mintedBy: 'admin',
        label: 'integration',
        revokedAt: null,
      });

      const days = (new Date(minted.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(1.9);
      expect(days).toBeLessThan(2.1);
    });

    it('rejects a TTL above the cap', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/api/repository')
        .set('Cookie', authCookie)
        .send({ name: 'cap-test' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/repository/${created.repository.id}/url`)
        .set('Cookie', authCookie)
        .send({ expiresIn: '400d' })
        .expect(400);
    });
  });

  describe('GET /restic-tokens', () => {
    it('lists tokens with filters', async () => {
      const { repository, minted } = await mintForNewRepository();

      const { body } = await request(app.getHttpServer())
        .get(`/api/restic-tokens?repositoryId=${repository.id}&active=true`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toEqual([expect.objectContaining({ jti: minted.jti, mintedBy: 'admin' })]);
      expect(body.nextCursor).toBeNull();
    });
  });

  describe('DELETE /restic-tokens/:jti', () => {
    it('revokes a token in the DB and (when configured) invalidates the verdict cache', async () => {
      const { minted } = await mintForNewRepository();

      const redis = await connectRedis();
      try {
        if (redis) {
          await redis.set(`yucca:michael:verdict:${minted.jti}`, '1', 'EX', 300);
        }

        await request(app.getHttpServer())
          .delete(`/api/restic-tokens/${minted.jti}`)
          .set('Cookie', authCookie)
          .expect(204);

        const row = await testUtils.getResticToken(minted.jti);
        expect(row!.revokedAt).not.toBeNull();
        expect(row!.revokedBy).toBe('admin');

        const { body } = await request(app.getHttpServer())
          .get('/api/restic-tokens?active=true')
          .set('Cookie', authCookie)
          .expect(200);
        expect(body.items).toEqual([]);

        if (redis) {
          expect(await redis.exists(`yucca:michael:verdict:${minted.jti}`)).toBe(0);
        }
      } finally {
        redis?.disconnect();
      }

      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${minted.jti}`)
        .set('Cookie', authCookie)
        .expect(204);
    });

    it('disabling a user invalidates their cached verdicts', async () => {
      const { minted } = await mintForNewRepository();
      const row = await testUtils.getResticToken(minted.jti);

      const redis = await connectRedis();
      try {
        if (redis) {
          await redis.set(`yucca:michael:verdict:${minted.jti}`, '1', 'EX', 300);
        }

        await request(app.getHttpServer())
          .patch(`/api/user/${row!.userId}`)
          .set('Cookie', authCookie)
          .send({ disabled: true })
          .expect(200);

        if (redis) {
          expect(await redis.exists(`yucca:michael:verdict:${minted.jti}`)).toBe(0);
        }
      } finally {
        redis?.disconnect();
      }
    });

    it('404s for unknown jtis', async () => {
      await request(app.getHttpServer())
        .delete('/api/restic-tokens/3f1f0d05-9a48-4a9e-8fb2-6f19f3f5f2aa')
        .set('Cookie', authCookie)
        .expect(404);
    });
  });
});
