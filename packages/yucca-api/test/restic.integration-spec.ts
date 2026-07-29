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

const verdictKey = (jti: string) => `yucca:michael:verdict:${jti}`;

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

    it('defaults to the long-lived restic TTL (revocable type)', async () => {
      await testUtils.setFeatureOverride(user.id, 'connection-restic', true);

      const { body } = await request(app.getHttpServer())
        .post('/api/connections/restic')
        .set('Cookie', cookie())
        .send({})
        .expect(201);

      // RESTIC_JWT_EXPIRES_IN default: 90d — long-lived is safe here because
      // restic tokens are revocable (validity-checked by michael).
      const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThan(90.1);
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

      // Simulate michael having cached a verdict for this token; the revoke
      // must invalidate it so the next check falls through to introspection.
      if (redis) {
        await redis.set(verdictKey(created.jti), '1', 'EX', 300);
      }

      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', cookie())
        .expect(204);

      const row = await testUtils.getResticToken(created.jti);
      expect(row!.revokedAt).not.toBeNull();
      expect(row!.revokedBy).toBe(`user:${user.id}`);
      if (redis) {
        expect(await redis.exists(verdictKey(created.jti))).toBe(0);
      }

      // Idempotent-ish: revoking again still 204s (already revoked).
      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', cookie())
        .expect(204);
    });

    it('deleting a repository invalidates its cached verdicts', async () => {
      const created = await createRestic();
      if (redis) {
        await redis.set(verdictKey(created.jti), '1', 'EX', 300);
      }

      await request(app.getHttpServer())
        .delete(`/api/repository/${created.repository.id}`)
        .set('Cookie', cookie())
        .expect(200);

      if (redis) {
        expect(await redis.exists(verdictKey(created.jti))).toBe(0);
      }
    });

    it('a false override is a kill-switch for new credentials (mint 403s, revoke still works)', async () => {
      const created = await createRestic();

      // Flag revoked after the connection/repo exist.
      await testUtils.setFeatureOverride(user.id, 'connection-restic', false);

      await request(app.getHttpServer())
        .post(`/api/repository/${created.repository.id}/restic`)
        .set('Cookie', cookie())
        .send({})
        .expect(403);

      // Revocation is never gated.
      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', cookie())
        .expect(204);
    });

    it("404s revoking another user's token without leaking it", async () => {
      const created = await createRestic();
      const other = await testUtils.createUser('other', 'other@example.com', 'other-sub');

      if (redis) {
        await redis.set(verdictKey(created.jti), '1', 'EX', 300);
      }

      await request(app.getHttpServer())
        .delete(`/api/restic-tokens/${created.jti}`)
        .set('Cookie', `yucca-access-token=${other.session.accessToken}`)
        .expect(404);

      // The failed revoke must not have invalidated the owner's cached verdict.
      if (redis) {
        expect(await redis.exists(verdictKey(created.jti))).toBe(1);
        await redis.del(verdictKey(created.jti));
      }
    });
  });
});
