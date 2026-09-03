import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TicketAction } from 'src/enum';
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
    app.useGlobalPipes(new ValidationPipe());
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

    it('embeds the connection claim', async () => {
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
      });
    });
  });

  describe('DELETE /repository/:id', () => {
    it('refuses without a confirmed ticket', async () => {
      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=00000000-0000-0000-0000-000000000000`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(403);

      await expect(testUtils.getRepository(repository.id)).resolves.toBeTruthy();
    });

    it('refuses a ticket confirmed for a different action', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, repository.id, TicketAction.DisableWorm);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(403);

      await expect(testUtils.getRepository(repository.id)).resolves.toBeTruthy();
    });

    it('refuses a ticket confirmed for a different repository', async () => {
      const other = await testUtils.createRepository(user.id, 'Other');
      const ticket = await testUtils.createActiveTicket(user.id, other.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(403);

      await expect(testUtils.getRepository(repository.id)).resolves.toBeTruthy();
    });

    it('refuses a ticket without its token cookie', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, repository.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(403);

      await expect(testUtils.getRepository(repository.id)).resolves.toBeTruthy();
    });

    it('deletes a repository with a confirmed ticket', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, repository.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(200);

      await expect(testUtils.getRepository(repository.id)).resolves.toBeUndefined();
    });

    it('deletes a write-only repository with a confirmed ticket', async () => {
      const worm = await testUtils.createRepository(user.id, 'Locked', true);
      const ticket = await testUtils.createActiveTicket(user.id, worm.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${worm.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(200);

      await expect(testUtils.getRepository(worm.id)).resolves.toBeUndefined();
    });

    it('records the deletion in the audit log', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, repository.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(200);

      await expect(testUtils.getAuditLog()).resolves.toEqual([
        expect.objectContaining({
          action: 'repository.delete',
          userId: user.id,
          detail: {
            ticket: { id: ticket.id, validAt: ticket.validAt!.toISOString() },
            repository: expect.objectContaining({
              id: repository.id,
              name: 'My Repository',
              worm: false,
              connectionId: repository.connectionId,
              siteCode: 'local',
              storageClusterCode: 'local-dev',
              metrics: expect.objectContaining({ sizeBytes: 0 }),
            }),
          },
        }),
      ]);
    });

    it('writes no audit entry when the ticket is refused', async () => {
      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=00000000-0000-0000-0000-000000000000`)
        .expect(403);

      await expect(testUtils.getAuditLog()).resolves.toEqual([]);
    });

    it('drops the tickets with the repository', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, repository.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(200);

      await expect(testUtils.getTicketByToken(ticket.token)).resolves.toBeUndefined();
    });
  });

  describe('DELETE /repository/:id/worm', () => {
    let worm: { id: string };

    beforeEach(async () => {
      worm = await testUtils.createRepository(user.id, 'Locked', true);
    });

    it('refuses without a confirmed ticket', async () => {
      await request(app.getHttpServer())
        .delete(`/api/repository/${worm.id}/worm?ticketId=00000000-0000-0000-0000-000000000000`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(403);

      await expect(testUtils.getRepository(worm.id)).resolves.toEqual(expect.objectContaining({ worm: true }));
    });

    it('refuses a ticket confirmed for deletion', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, worm.id, TicketAction.DeleteRepository);

      await request(app.getHttpServer())
        .delete(`/api/repository/${worm.id}/worm?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(403);

      await expect(testUtils.getRepository(worm.id)).resolves.toEqual(expect.objectContaining({ worm: true }));
    });

    it('rejects a repository that is not write-only', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, repository.id, TicketAction.DisableWorm);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}/worm?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(400);
    });

    it('disables write-only with a confirmed ticket', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, worm.id, TicketAction.DisableWorm);

      await request(app.getHttpServer())
        .delete(`/api/repository/${worm.id}/worm?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(200);

      await expect(testUtils.getRepository(worm.id)).resolves.toEqual(expect.objectContaining({ worm: false }));
      await expect(testUtils.getAuditLog()).resolves.toEqual([
        expect.objectContaining({
          action: 'repository.disable-worm',
          userId: user.id,
          detail: {
            ticket: { id: ticket.id, validAt: ticket.validAt!.toISOString() },
            repository: expect.objectContaining({ name: 'Locked', worm: true }),
          },
        }),
      ]);
    });

    it('spends the ticket so it cannot be reused', async () => {
      const ticket = await testUtils.createActiveTicket(user.id, worm.id, TicketAction.DisableWorm);

      await request(app.getHttpServer())
        .delete(`/api/repository/${worm.id}/worm?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(200);

      await expect(testUtils.getTicketByToken(ticket.token)).resolves.toEqual(
        expect.objectContaining({ consumedAt: expect.any(Date) }),
      );

      await request(app.getHttpServer())
        .delete(`/api/repository/${worm.id}/worm?ticketId=${ticket.id}`)
        .set('Cookie', `yucca-ticket-token=${ticket.token}`)
        .expect(403);
    });
  });

  describe('PATCH /repository/:id', () => {
    it('refuses to disable write-only without a ticket', async () => {
      const worm = await testUtils.createRepository(user.id, 'Locked', true);

      await request(app.getHttpServer())
        .patch(`/api/repository/${worm.id}`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ worm: false })
        .expect(400);

      await expect(testUtils.getRepository(worm.id)).resolves.toEqual(expect.objectContaining({ worm: true }));
    });
  });
});
