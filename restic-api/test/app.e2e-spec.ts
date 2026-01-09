import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const makeAuthHeader = (token: string) => 'Basic ' + Buffer.from(`_:${token}`).toString('base64');

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  let repository: string;
  let authHeader: string;
  let wormAuthHeader: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const jwtService = app.get(JwtService);
    repository = randomUUID();
    authHeader = makeAuthHeader(jwtService.sign({ user: 'test-user', repository, writeOnce: false }));
    wormAuthHeader = makeAuthHeader(jwtService.sign({ user: 'test-user', repository, writeOnce: true }));
  });

  describe('POST /:path', () => {
    it('fails if create is not true', async () => {
      await request(app.getHttpServer())
        .post(`/${repository}?create=false`)
        .set('Authorization', authHeader)
        .expect(400);
    });

    it('creates the repository', async () => {
      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);
    });

    it('fails if repository already exists', async () => {
      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(409);
    });
  });

  describe('DELETE /:path', () => {
    it('returns not implemented', async () => {
      await request(app.getHttpServer()).delete(`/${repository}`).set('Authorization', authHeader).expect(501);
    });
  });

  describe('HEAD /:path/config', () => {
    it('returns 404 if config does not exist', async () => {
      await request(app.getHttpServer()).head(`/${repository}/config`).set('Authorization', authHeader).expect(404);
    });

    it('returns content-length if config exists', async () => {
      const config = 'test-config-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/config`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(config))
        .expect(200);

      await request(app.getHttpServer())
        .head(`/${repository}/config`)
        .set('Authorization', authHeader)
        .expect(200)
        .expect('Content-Length', String(config.length));
    });
  });

  describe('GET, POST /:path/config', () => {
    it('saves and returns config data', async () => {
      const config = 'test-config-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/config`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(config))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/${repository}/config`)
        .set('Authorization', authHeader)
        .expect(200)
        .expect('Content-Type', 'application/octet-stream');

      expect(response.body.toString()).toBe(config);
    });

    it('fails to overwrite config with worm', async () => {
      const config = 'test-config-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', wormAuthHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/config`)
        .set('Authorization', wormAuthHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(config))
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/config`)
        .set('Authorization', wormAuthHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(config))
        .expect(409);
    });
  });

  describe('GET /:path/:type', () => {
    it('returns 501 without restic v2 accept header', async () => {
      await request(app.getHttpServer()).get(`/${repository}/data`).set('Authorization', authHeader).expect(501);
    });

    it('returns empty list when no blobs exist', async () => {
      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/${repository}/data`)
        .set('Authorization', authHeader)
        .set('Accept', 'application/vnd.x.restic.rest.v2')
        .expect(200)
        .expect('Content-Type', 'application/vnd.x.restic.rest.v2');

      expect(JSON.parse(response.text)).toEqual([]);
    });

    it('returns list of blobs when they exist', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/${repository}/data`)
        .set('Authorization', authHeader)
        .set('Accept', 'application/vnd.x.restic.rest.v2')
        .expect(200)
        .expect('Content-Type', 'application/vnd.x.restic.rest.v2');

      expect(JSON.parse(response.text)).toEqual([{ name: blobName, size: blobData.length }]);
    });
  });

  describe('HEAD /:path/:type/:name', () => {
    it('returns 404 if blob does not exist', async () => {
      await request(app.getHttpServer())
        .head(`/${repository}/data/${randomUUID()}`)
        .set('Authorization', authHeader)
        .expect(404);
    });

    it('returns content-length if blob exists', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      await request(app.getHttpServer())
        .head(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .expect(200)
        .expect('Content-Length', String(blobData.length));
    });
  });

  describe('GET, POST /:path/:type/:name', () => {
    it('saves and returns blob data', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .expect(200)
        .expect('Content-Type', 'application/octet-stream');

      expect(response.body.toString()).toBe(blobData);
    });

    it('returns partial content with range header', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .set('Range', 'bytes=0-3')
        .expect(206)
        .expect('Content-Type', 'application/octet-stream');

      expect(response.body.toString()).toBe('test');
    });

    it('fails to overwrite blob with worm', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', wormAuthHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', wormAuthHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', wormAuthHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(409);
    });
  });

  describe('DELETE /:path/:type/:name', () => {
    it('deletes a blob', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .expect(200);

      await request(app.getHttpServer())
        .head(`/${repository}/data/${blobName}`)
        .set('Authorization', authHeader)
        .expect(404);
    });

    it('fails to delete blob with worm', async () => {
      const blobName = randomUUID();
      const blobData = 'test-blob-data';

      await request(app.getHttpServer())
        .post(`/${repository}?create=true`)
        .set('Authorization', wormAuthHeader)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/${repository}/data/${blobName}`)
        .set('Authorization', wormAuthHeader)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(blobData))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/${repository}/data/${blobName}`)
        .set('Authorization', wormAuthHeader)
        .expect(405);
    });
  });
});
