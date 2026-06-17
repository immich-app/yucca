import { AwsClient } from 'aws4fetch';
import { env } from 'src/env';
import { type BucketStats, RgwRepository } from 'src/repositories/rgw.repository';

describe('RgwRepository (integration)', () => {
  let repository: RgwRepository;

  const s3 = new AwsClient({
    accessKeyId: env.RADOS_ACCESS_KEY_ID,
    secretAccessKey: env.RADOS_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'rgw',
  });

  const suffix = `${Date.now()}`;
  const buckets = [`yucca-it-${suffix}-a`, `yucca-it-${suffix}-b`];
  const bucketUrl = (bucket: string) => new URL(`/${bucket}`, env.RADOS_ENDPOINT).toString();

  beforeAll(async () => {
    repository = new RgwRepository();

    for (const bucket of buckets) {
      const response = await s3.fetch(bucketUrl(bucket), { method: 'PUT' });
      if (!response.ok) {
        throw new Error(`Failed to create bucket ${bucket}: ${response.status} ${await response.text()}`);
      }
    }
  });

  afterAll(async () => {
    for (const bucket of buckets) {
      await s3.fetch(bucketUrl(bucket), { method: 'DELETE' });
    }
  });

  it('gets stats for every bucket', async () => {
    const stats: BucketStats[] = [];

    for await (const stat of repository.getBucketStats()) {
      stats.push(stat);
      expect(typeof stat.bucket).toBe('string');
      expect(stat.bucket.length).toBeGreaterThan(0);
      expect(stat.objects).toBeGreaterThanOrEqual(0);
      expect(stat.bytes).toBeGreaterThanOrEqual(0);
    }

    expect(stats.map((stat) => stat.bucket)).toEqual(expect.arrayContaining(buckets));
  });

  it('gets stats for every bucket with pagination', async () => {
    const bulk: BucketStats[] = [];
    for await (const stat of repository.getBucketStats()) {
      bulk.push(stat);
    }

    const streamed: BucketStats[] = [];
    for await (const stat of repository.getBucketStatsStream(1)) {
      streamed.push(stat);
      expect(stat.objects).toBeGreaterThanOrEqual(0);
      expect(stat.bytes).toBeGreaterThanOrEqual(0);
    }

    expect(streamed.map((stat) => stat.bucket)).toEqual(expect.arrayContaining(buckets));
    expect(new Set(streamed.map((stat) => stat.bucket))).toEqual(new Set(bulk.map((stat) => stat.bucket)));
  });
});
