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

describe('SettingsController (e2e)', () => {
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

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/settings').expect(401);
    await request(app.getHttpServer()).put('/api/settings/global').send({}).expect(401);
    await request(app.getHttpServer()).delete('/api/settings/global').expect(401);
  });

  it('round-trips global and site scopes', async () => {
    await request(app.getHttpServer())
      .put('/api/settings/global')
      .set('Cookie', authCookie)
      .send({ restic_pack_size_mib: 32 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.entry).toMatchObject({ scope: 'global', value: { restic_pack_size_mib: 32 } });
      });

    await request(app.getHttpServer())
      .put('/api/settings/site:local')
      .set('Cookie', authCookie)
      .send({ connections_math: 'min(16, cores * 2)' })
      .expect(200);

    const { body } = await request(app.getHttpServer()).get('/api/settings').set('Cookie', authCookie).expect(200);
    expect(body.settings).toEqual([
      expect.objectContaining({ scope: 'global', value: { restic_pack_size_mib: 32 } }),
      expect.objectContaining({ scope: 'site:local', value: { connections_math: 'min(16, cores * 2)' } }),
    ]);

    await request(app.getHttpServer())
      .put('/api/settings/global')
      .set('Cookie', authCookie)
      .send({ restic_pack_size_mib: 64 })
      .expect(200);

    const updated = await request(app.getHttpServer()).get('/api/settings').set('Cookie', authCookie).expect(200);
    expect(updated.body.settings).toHaveLength(2);
    expect(updated.body.settings[0].value).toEqual({ restic_pack_size_mib: 64 });

    await request(app.getHttpServer()).delete('/api/settings/site:local').set('Cookie', authCookie).expect(204);
    const afterDelete = await request(app.getHttpServer()).get('/api/settings').set('Cookie', authCookie).expect(200);
    expect(afterDelete.body.settings).toHaveLength(1);
  });

  it('rejects unknown keys, bad values, bad scopes, and unknown sites', async () => {
    await request(app.getHttpServer())
      .put('/api/settings/global')
      .set('Cookie', authCookie)
      .send({ nonsense: true })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/settings/global')
      .set('Cookie', authCookie)
      .send({ connections_math: 'process.exit(1)' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/settings/basement')
      .set('Cookie', authCookie)
      .send({ restic_pack_size_mib: 16 })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/settings/site:nowhere')
      .set('Cookie', authCookie)
      .send({ restic_pack_size_mib: 16 })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/settings/cluster:nowhere')
      .set('Cookie', authCookie)
      .send({ restic_pack_size_mib: 16 })
      .expect(400);
  });

  it('accepts cluster scopes for known clusters', async () => {
    await request(app.getHttpServer())
      .put('/api/settings/cluster:local-dev')
      .set('Cookie', authCookie)
      .send({ restic_pack_size_mib: 8 })
      .expect(200);
  });
});
