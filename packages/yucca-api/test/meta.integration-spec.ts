import { MetricService } from '@common/server/otel';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Kysely } from 'kysely';
import request from 'supertest';
import { App } from 'supertest/types';
import { controllers, imports, providers } from '../src/app.module';
import { DB } from '../src/schema';
import { getKyselyConfig } from '../src/utils/database';
import { newMetricServiceMock } from './mocks';
import { testUtils } from './testUtils';

describe('MetaController (e2e)', () => {
  let app: INestApplication<App>;
  let db: Kysely<DB>;

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

    db = new Kysely<DB>(getKyselyConfig());
  });

  afterAll(async () => {
    await db.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await testUtils.resetDatabase();
  });

  describe('GET /meta', () => {
    it('is public and returns defaults with the dev topology', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/meta').expect(200);

      expect(body).toEqual({
        api_root: 'http://localhost:3020/api',
        config: { restic_pack_size_mib: 16, connections_math: '16' },
        default_site: 'local',
        sites: [
          {
            code: 'local',
            display_name: 'Local development',
            description: 'Compose/k3d development site',
            rest_url: 'http://localhost:3010',
            default_cluster: 'local-dev',
            site_config: {},
            clusters: [
              {
                code: 'local-dev',
                display_name: 'Local development storage',
                cluster_config: {},
              },
            ],
          },
        ],
      });
    });

    it('reflects global and site overrides from the settings table', async () => {
      await db
        .insertInto('settings')
        .values([
          { scope: 'global', value: { restic_pack_size_mib: 64 } },
          { scope: 'site:local', value: { connections_math: 'min(16, cores * 2)' } },
          { scope: 'cluster:local-dev', value: { restic_pack_size_mib: 32 } },
        ])
        .execute();

      const { body } = await request(app.getHttpServer()).get('/api/meta').expect(200);

      expect(body.config).toEqual({ restic_pack_size_mib: 64, connections_math: '16' });
      expect(body.sites[0].site_config).toEqual({ connections_math: 'min(16, cores * 2)' });
      expect(body.sites[0].clusters[0].cluster_config).toEqual({ restic_pack_size_mib: 32 });
    });
  });

  describe('repository placement', () => {
    it('stamps new repositories with the default site and active cluster and mints a site URL', async () => {
      const { session } = await testUtils.createUser();

      const created = await request(app.getHttpServer())
        .post('/api/repository')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ name: 'placed', worm: false })
        .expect(201);

      expect(created.body.repository.siteCode).toBe('local');

      const row = await db
        .selectFrom('repositories')
        .selectAll()
        .where('id', '=', created.body.repository.id)
        .executeTakeFirstOrThrow();
      expect(row.siteCode).toBe('local');
      expect(row.storageClusterCode).toBe('local-dev');

      const minted = await request(app.getHttpServer())
        .post(`/api/repository/${created.body.repository.id}/restic`)
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .expect(201);

      expect(minted.body.url).toMatch(
        new RegExp(`^rest:http://restic:.+@localhost:3010/${created.body.repository.id}$`),
      );

      const token = minted.body.url.split(':')[3].split('@')[0];
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      expect(claims).toMatchObject({
        repository: created.body.repository.id,
        writeOnce: false,
        storageCluster: 'local-dev',
      });
    });

    it('rejects creation with an unknown site', async () => {
      const { session } = await testUtils.createUser();

      await request(app.getHttpServer())
        .post('/api/repository')
        .set('Cookie', `yucca-access-token=${session.accessToken}`)
        .send({ name: 'misplaced', worm: false, site: 'nowhere' })
        .expect(400);
    });
  });
});
