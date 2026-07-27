import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OidcRepository } from 'src/repositories/oidc.repository';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

const authCookie = ['yucca-admin-sub=admin', 'yucca-admin-access-token=token'];

describe('AllowlistController (e2e)', () => {
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

  describe('GET /allowlist', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/allowlist').expect(401);
    });

    it('lists entries', async () => {
      const alice = await testUtils.createAllowlistEntry({ email: 'alice@example.com', invited: true });
      const bob = await testUtils.createAllowlistEntry({ email: 'bob@example.com' });

      const { body } = await request(app.getHttpServer()).get('/api/allowlist').set('Cookie', authCookie).expect(200);

      expect(body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: alice.id, email: 'alice@example.com', invited: true, inviteUsed: false }),
          expect.objectContaining({ id: bob.id, email: 'bob@example.com', invited: false }),
        ]),
      );
      expect(body.nextCursor).toBeNull();
    });

    it('paginates with limit and returns a cursor', async () => {
      await testUtils.createAllowlistEntry({ email: 'a@example.com' });
      await testUtils.createAllowlistEntry({ email: 'b@example.com' });
      await testUtils.createAllowlistEntry({ email: 'c@example.com' });

      const { body } = await request(app.getHttpServer())
        .get('/api/allowlist?limit=2')
        .set('Cookie', authCookie)
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toEqual(expect.any(String));

      const { body: page2 } = await request(app.getHttpServer())
        .get(`/api/allowlist?limit=2&cursor=${body.nextCursor}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('POST /allowlist', () => {
    it('adds an invited entry with a generated code', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/allowlist')
        .set('Cookie', authCookie)
        .send({ email: 'New@Example.com' })
        .expect(201);

      expect(body.entry).toEqual(
        expect.objectContaining({
          email: 'new@example.com',
          invited: true,
          inviteUsed: false,
          inviteCode: expect.stringMatching(/^[0-9A-Z]{10}$/),
        }),
      );
    });

    it('adds a staged entry', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/allowlist')
        .set('Cookie', authCookie)
        .send({ email: 'staged@example.com', staged: true })
        .expect(201);

      expect(body.entry).toEqual(expect.objectContaining({ email: 'staged@example.com', invited: false }));
    });

    it('rejects a duplicate email', async () => {
      await testUtils.createAllowlistEntry({ email: 'dupe@example.com' });

      await request(app.getHttpServer())
        .post('/api/allowlist')
        .set('Cookie', authCookie)
        .send({ email: 'DUPE@example.com' })
        .expect(409);
    });

    it('rejects an invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/allowlist')
        .set('Cookie', authCookie)
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('DELETE /allowlist/:email', () => {
    it('removes an entry', async () => {
      await testUtils.createAllowlistEntry({ email: 'gone@example.com' });

      await request(app.getHttpServer())
        .delete('/api/allowlist/gone%40example.com')
        .set('Cookie', authCookie)
        .expect(204);

      await expect(testUtils.getAllowlistEntry('gone@example.com')).resolves.toBeUndefined();
    });

    it('404s for an unknown email', async () => {
      await request(app.getHttpServer())
        .delete('/api/allowlist/unknown%40example.com')
        .set('Cookie', authCookie)
        .expect(404);
    });
  });

  describe('POST /allowlist/invite', () => {
    it('invites existing staged entries and creates missing ones', async () => {
      const staged = await testUtils.createAllowlistEntry({ email: 'staged@example.com' });

      const { body } = await request(app.getHttpServer())
        .post('/api/allowlist/invite')
        .set('Cookie', authCookie)
        .send({ emails: ['staged@example.com', 'fresh@example.com'] })
        .expect(201);

      expect(body.items).toEqual([
        expect.objectContaining({ id: staged.id, email: 'staged@example.com', invited: true }),
        expect.objectContaining({ email: 'fresh@example.com', invited: true }),
      ]);
    });

    it('leaves already-invited entries untouched', async () => {
      const invited = await testUtils.createAllowlistEntry({ email: 'already@example.com', invited: true });

      const { body } = await request(app.getHttpServer())
        .post('/api/allowlist/invite')
        .set('Cookie', authCookie)
        .send({ emails: ['already@example.com'] })
        .expect(201);

      expect(body.items).toEqual([expect.objectContaining({ id: invited.id, inviteCode: invited.inviteCode })]);
    });
  });

  describe('POST /allowlist/invite-batch', () => {
    it('invites the oldest staged entries', async () => {
      const oldest = await testUtils.createAllowlistEntry({
        email: 'oldest@example.com',
        createdAt: new Date('2026-01-01'),
      });
      const middle = await testUtils.createAllowlistEntry({
        email: 'middle@example.com',
        createdAt: new Date('2026-02-01'),
      });
      await testUtils.createAllowlistEntry({ email: 'newest@example.com', createdAt: new Date('2026-03-01') });
      await testUtils.createAllowlistEntry({ email: 'invited@example.com', invited: true });

      const { body } = await request(app.getHttpServer())
        .post('/api/allowlist/invite-batch')
        .set('Cookie', authCookie)
        .send({ count: 2 })
        .expect(201);

      expect(body.items).toEqual([
        expect.objectContaining({ id: oldest.id, invited: true }),
        expect.objectContaining({ id: middle.id, invited: true }),
      ]);
      await expect(testUtils.getAllowlistEntry('newest@example.com')).resolves.toEqual(
        expect.objectContaining({ invited: false }),
      );
    });

    it('validates count', async () => {
      await request(app.getHttpServer())
        .post('/api/allowlist/invite-batch')
        .set('Cookie', authCookie)
        .send({ count: 0 })
        .expect(400);
    });
  });
});
