import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { parse } from 'cookie';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('Ticket flow (e2e)', () => {
  let app: INestApplication<App>;
  let user: { id: string; name: string; email: string; sub: string };
  let session: { id: string; accessToken: string };
  let repository: { id: string; name: string };

  const cookie = () => `yucca-access-token=${session.accessToken}`;

  const mint = async (action: string, repositoryId: string) => {
    const { body } = await request(app.getHttpServer())
      .post('/api/auth/ticket')
      .set('Cookie', cookie())
      .send({ action, repositoryId })
      .expect(201);

    return body as { token: string; redirectTo: string };
  };

  const authenticate = async (redirectTo: string, sub: string) => {
    const authorizeUrl = new URL(redirectTo);
    authorizeUrl.pathname = '/api/form';
    authorizeUrl.searchParams.set('sub', sub);

    const { headers } = await fetch(authorizeUrl, { redirect: 'manual' });
    const callbackUrl = new URL(headers.get('location')!);

    return request(app.getHttpServer()).get(callbackUrl.pathname + callbackUrl.search);
  };

  const activate = async (action: string, repositoryId: string) => {
    const { token, redirectTo } = await mint(action, repositoryId);
    const response = await authenticate(redirectTo, user.sub);
    expect(response.status).toBe(302);

    return token;
  };

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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
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

  describe('POST /auth/ticket', () => {
    it('fails with no auth provided', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/ticket')
        .send({ action: 'repository.delete', repositoryId: repository.id })
        .expect(401);
    });

    it('rejects an unknown action', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/ticket')
        .set('Cookie', cookie())
        .send({ action: 'repository.explode', repositoryId: repository.id })
        .expect(400);
    });

    it('rejects a repositoryId that is not a uuid', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/ticket')
        .set('Cookie', cookie())
        .send({ action: 'repository.delete', repositoryId: 'not-a-uuid' })
        .expect(400);
    });

    it('refuses a repository owned by someone else', async () => {
      const other = await testUtils.createUser('bar', 'bar@example.com', 'bar');
      const otherRepository = await testUtils.createRepository(other.user.id);

      await request(app.getHttpServer())
        .post('/api/auth/ticket')
        .set('Cookie', cookie())
        .send({ action: 'repository.delete', repositoryId: otherRepository.id })
        .expect(401);
    });

    it('mints a pending ticket and points at the identity provider', async () => {
      const { token, redirectTo } = await mint('repository.delete', repository.id);

      const url = new URL(redirectTo);
      expect(url.searchParams.get('prompt')).toBe('login');
      expect(url.searchParams.get('max_age')).toBe('0');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBeTruthy();

      const ticket = await testUtils.getTicketByToken(token);
      expect(ticket).toMatchObject({
        userId: user.id,
        repositoryId: repository.id,
        action: 'repository.delete',
        validAt: null,
        consumedAt: null,
      });
      expect(ticket?.oidcState).toBe(url.searchParams.get('state'));
    });
  });

  describe('GET /auth/ticket/callback', () => {
    it('activates the ticket and hands back a ticket cookie', async () => {
      const { token, redirectTo } = await mint('repository.delete', repository.id);

      const response = await authenticate(redirectTo, user.sub);
      expect(response.status).toBe(302);

      const ticket = await testUtils.getTicketByToken(token);
      expect(ticket?.validAt).not.toBeNull();
      expect(ticket?.authTime).not.toBeNull();
      expect(response.header.location).toBe(`/tickets/${ticket?.id}`);

      const cookies = parse((response.header['set-cookie'] as never as string[]).join('; '));
      expect(cookies['yucca-ticket-id']).toBe(ticket?.id);
    });

    it('rejects an unknown state', async () => {
      await request(app.getHttpServer()).get('/api/auth/ticket/callback?code=whatever&state=nonexistent').expect(400);
    });

    it('refuses when a different account authenticates', async () => {
      await testUtils.createUser('bar', 'bar@example.com', 'bar');
      const { token, redirectTo } = await mint('repository.delete', repository.id);

      const response = await authenticate(redirectTo, 'bar');
      expect(response.status).toBe(401);

      const ticket = await testUtils.getTicketByToken(token);
      expect(ticket?.validAt).toBeNull();
    });
  });

  describe('GET /auth/ticket', () => {
    it('describes the pending action for the confirm page', async () => {
      const { redirectTo } = await mint('repository.delete', repository.id);
      const response = await authenticate(redirectTo, user.sub);
      expect(response.status).toBe(302);
      const cookies = parse((response.header['set-cookie'] as never as string[]).join('; '));

      await request(app.getHttpServer())
        .get('/api/auth/ticket')
        .set('Cookie', `yucca-ticket-id=${cookies['yucca-ticket-id']}`)
        .expect(200)
        .expect({
          id: cookies['yucca-ticket-id'],
          action: 'repository.delete',
          repositoryId: repository.id,
          repositoryName: repository.name,
        });
    });
  });

  describe('DELETE /repository/:id', () => {
    it('refuses without a ticket', async () => {
      await request(app.getHttpServer()).delete(`/api/repository/${repository.id}`).expect(403);
    });

    it('refuses an unknown ticket', async () => {
      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}`)
        .set('x-yucca-ticket', 'nope')
        .expect(403);
    });

    it('refuses a ticket that has not been through the identity provider', async () => {
      const { token } = await mint('repository.delete', repository.id);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}`)
        .set('x-yucca-ticket', token)
        .expect(403);
    });

    it('spends an activated ticket and reaches the deletion, which is not implemented yet', async () => {
      const token = await activate('repository.delete', repository.id);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}`)
        .set('x-yucca-ticket', token)
        .expect(500);

      const ticket = await testUtils.getTicketByToken(token);
      expect(ticket?.consumedAt).not.toBeNull();
    });

    it('refuses to spend the same ticket twice', async () => {
      const token = await activate('repository.delete', repository.id);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}`)
        .set('x-yucca-ticket', token)
        .expect(500);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}`)
        .set('x-yucca-ticket', token)
        .expect(403);
    });

    it('refuses a ticket bound to a different repository', async () => {
      const other = await testUtils.createRepository(user.id, 'Other');
      const token = await activate('repository.delete', other.id);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}`)
        .set('x-yucca-ticket', token)
        .expect(403);
    });

    it('refuses a delete ticket on the worm route', async () => {
      const token = await activate('repository.delete', repository.id);

      await request(app.getHttpServer())
        .delete(`/api/repository/${repository.id}/worm`)
        .set('x-yucca-ticket', token)
        .expect(403);
    });
  });

  describe('DELETE /repository/:id/worm', () => {
    it('clears write-once with a matching ticket', async () => {
      const locked = await testUtils.createRepository(user.id, 'Locked', true);
      const token = await activate('repository.disable-worm', locked.id);

      const { body } = await request(app.getHttpServer())
        .delete(`/api/repository/${locked.id}/worm`)
        .set('x-yucca-ticket', token)
        .expect(200);

      expect(body.repository.worm).toBe(false);
    });
  });
});
