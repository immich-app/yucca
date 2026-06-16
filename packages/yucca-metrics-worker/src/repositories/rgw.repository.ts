import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { env } from 'src/env';

type RgwUsageCategory = { num_objects?: number; size_actual?: number };
type RgwBucketEntry = { bucket: string; usage?: Record<string, RgwUsageCategory> };

export type BucketStats = { bucket: string; objects: number; bytes: number };

@Injectable()
export class RgwRepository {
  private aws = new AwsClient({
    accessKeyId: env.RADOS_ACCESS_KEY_ID,
    secretAccessKey: env.RADOS_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'rgw',
  });

  async getBucketStats(): Promise<BucketStats[]> {
    const entries: RgwBucketEntry[] = await this.adminRequest('/admin/bucket', { format: 'json', stats: 'true' });

    return entries.map((entry) => ({
      bucket: entry.bucket,
      objects: entry.usage?.['rgw.main']?.num_objects ?? 0,
      bytes: entry.usage?.['rgw.main']?.size_actual ?? 0,
    }));
  }

  async *getBucketStatsStream(pageSize = 1000): AsyncGenerator<BucketStats> {
    let marker = '';

    for (;;) {
      const query: Record<string, string> = { format: 'json', stats: 'true', 'max-entries': String(pageSize) };
      if (marker) {
        query.marker = marker;
      }

      const entries: RgwBucketEntry[] = await this.adminRequest('/admin/bucket', query);
      for (const entry of entries) {
        yield {
          bucket: entry.bucket,
          objects: entry.usage?.['rgw.main']?.num_objects ?? 0,
          bytes: entry.usage?.['rgw.main']?.size_actual ?? 0,
        };
      }

      const last = entries.at(-1);
      if (!last || entries.length < pageSize) {
        return;
      }
      marker = last.bucket;
    }
  }

  private async adminRequest(path: string, query: Record<string, string>): Promise<any> {
    const url = new URL(env.RADOS_ENDPOINT.href);
    url.pathname = path;
    url.search = new URLSearchParams(query).toString();

    const response = await this.aws.fetch(url.toString());
    if (!response.ok) {
      throw new Error(`RGW admin ${path} failed: ${response.status} ${response.statusText} — ${await response.text()}`);
    }

    return response.json();
  }
}
