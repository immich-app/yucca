import { AwsClient } from 'aws4fetch';

type RgwUsageCategory = { num_objects?: number; size_actual?: number };
type RgwBucketEntry = { bucket: string; usage?: Record<string, RgwUsageCategory> };

export type BucketStats = { bucket: string; objects: number; bytes: number };

export type RgwRepositoryOptions = {
  clusterCode: string;
  endpoint: URL;
  accessKeyId: string;
  secretAccessKey: string;
};

export class RgwRepository {
  readonly clusterCode: string;
  private readonly endpoint: URL;
  private readonly aws: AwsClient;

  constructor({ clusterCode, endpoint, accessKeyId, secretAccessKey }: RgwRepositoryOptions) {
    this.clusterCode = clusterCode;
    this.endpoint = endpoint;
    this.aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'rgw' });
  }

  async *getBucketStats(): AsyncGenerator<BucketStats> {
    const entries: RgwBucketEntry[] = await this.adminRequest('/admin/bucket', { format: 'json', stats: 'true' });

    for (const entry of entries) {
      yield {
        bucket: entry.bucket,
        objects: entry.usage?.['rgw.main']?.num_objects ?? 0,
        bytes: entry.usage?.['rgw.main']?.size_actual ?? 0,
      };
    }
  }

  async *getBucketStatsStream(pageSize = 1000): AsyncGenerator<BucketStats> {
    // Some RGW versions ignore max-entries/marker on /admin/bucket (v19.2.2 returns the full listing every page),
    // so entries.length < pageSize alone would loop forever. Dedupe by bucket; stop when a page yields nothing new.
    const seen = new Set<string>();
    let marker = '';

    for (;;) {
      const query: Record<string, string> = { format: 'json', stats: 'true', 'max-entries': String(pageSize) };
      if (marker) {
        query.marker = marker;
      }

      const entries: RgwBucketEntry[] = await this.adminRequest('/admin/bucket', query);
      let progressed = false;
      for (const entry of entries) {
        if (seen.has(entry.bucket)) {
          continue;
        }
        seen.add(entry.bucket);
        progressed = true;
        yield {
          bucket: entry.bucket,
          objects: entry.usage?.['rgw.main']?.num_objects ?? 0,
          bytes: entry.usage?.['rgw.main']?.size_actual ?? 0,
        };
      }

      const last = entries.at(-1);
      if (!last || entries.length < pageSize || !progressed) {
        return;
      }
      marker = last.bucket;
    }
  }

  private async adminRequest(path: string, query: Record<string, string>): Promise<any> {
    const url = new URL(this.endpoint.href);
    url.pathname = path;
    url.search = new URLSearchParams(query).toString();

    const response = await this.aws.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`RGW admin ${path} failed: ${response.status} ${response.statusText} — ${await response.text()}`);
    }

    return response.json();
  }
}
