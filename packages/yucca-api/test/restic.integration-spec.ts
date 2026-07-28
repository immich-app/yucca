import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { env } from 'src/env';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

// Decodes a JWT payload without verifying the signature — enough to assert claims.
const decodeClaims = (jwt: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

const validKey = (jti: string) => `yucca:restic:valid:${jti}`;

describe('Self-serve restic (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string };
  let session: { accessToken: string };
  let redis: Redis | null;

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
    ({ user, session } = await testUtils.createUser());
    redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 2000 }) : null;
  });

  afterEach(async () => {
    redis?.disconnect();
    await app.close();
  });

  describe('POST /connections/restic', () => {
    it('403s without the connection-restic flag', async () => {
      await request(app.getHttpServer()).post('/api/connections/restic').set('Cookie', cookie()).send({}).expect(403);
    });

    it('creates a connection + repository + long-lived URL in one shot', async () => {
      await testUtils.setFeatureOverride(user.id, 'connection-restic', true);

      const { body } = await request(app.getHttpServer())
        .post('/api/connections/restic')
        .set('Cookie', cookie())
        .send({ name: 'laptop', expiresIn: '30d', label: 'my laptop' })
        .expect(201);

      expect(body.connection).toMatchObject({ type: 'restic', repositoryCount: 1 });
      expect(body.repository).toMatchObject({ name: 'laptop', connectionType: 'restic' });
      expect(body.url).toMatch(/^rest:/);
      expect(body.jti).toEqual(expect.any(String));

      // The embedded JWT carries the restic connection claim and repo binding.
      const jwt = new URL(body.url.slice('rest:'.length)).password;
      expect(decodeClaims(decodeURIComponent(jwt))).toMatchObject({
        user: user.id,
        repository: body.repository.id,
        connection: 'restic',
        jti: body.jti,
      });

      // ~30 days out, under the cap.
      const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThan(30.1);

      // restic is revocable → a validity marker exists for michael.
      if (redis) {
        expect(await redis.exists(validKey(body.jti))).toBe(1);
      }

      // Re-running reuses the same restic connection (idempotent on the connection).
      const { body: second } = await request(app.getHttpServer())
        .post('/api/connections/restic')
        .set('Cookie', cookie())
        .send({ name: 'desktop' })
        .expect(201);
      expect(second.connection.id).toBe(body.connection.id);
      expect(second.connection.repositoryCount).toBe(2);
    });

    it('rejects a TTL above the cap', async () => {
      await testUtils.setFeatureOverride(user.id, 'connection-restic', true);

      await request(app.getHttpServer())
        .post('/api/connections/restic')
        .set('Cookie', cookie())
        .send({ expiresIn: '400d' })
        .expect(400);
    });
  });

  describe('token management', () => {
    const createRestic = async () => {
      await testUtils.setFeatureOverride(user.id, 'connection-restic', true);
      const { body } = await request(app.getHttpServer())
        .post('/api/connections/restic')
        .set('Cookie', cookie())
        .send({ label: 'first' })
        .expect(201);
      return body;
    };

    it('lists a repository’s tokens and revokes them (owner-scoped)', async () => {
      const created = await createRestic();

      const { body: list } = await request(app.getHttpServer())
        .get(`/api/repository/${created.repository.id}/restic-tokens`)
        .set('Cookie', cookie())
        .expect(200);
      expect(list.tokens).toEqual([
        expect.objectContaining({ jti: created.jti, label: 'first', mintedBy: 'user', revokedAt: null }),
      ]);

      // Revoke, then the DB row is revoked and the Redis marker is gone.
      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', cookie())
        .expect(204);

      const row = await testUtils.getResticToken(created.jti);
      expect(row!.revokedAt).not.toBeNull();
      expect(row!.revokedBy).toBe(`user:${user.id}`);
      if (redis) {
        expect(await redis.exists(validKey(created.jti))).toBe(0);
      }

      // Idempotent-ish: revoking again still 204s (already revoked).
      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', cookie())
        .expect(204);
    });

    it("404s revoking another user's token without leaking it", async () => {
      const created = await createRestic();
      const other = await testUtils.createUser('other', 'other@example.com', 'other-sub');

      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', `yucca-access-token=${other.session.accessToken}`)
        .expect(404);

      // Still valid for the owner.
      if (redis) {
        expect(await redis.exists(validKey(created.jti))).toBe(1);
      }
    });
  });
});
