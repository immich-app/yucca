import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { env } from 'src/env';

type RgwUsageCategory = { num_objects?: number; size_actual?: number };
type RgwBucketEntry = { bucket: string; owner: string; usage?: Record<string, RgwUsageCategory> };

export type BucketStats = { bucket: string; owner: string; objects: number; bytes: number };

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
      owner: entry.owner,
      objects: entry.usage?.['rgw.main']?.num_objects ?? 0,
      bytes: entry.usage?.['rgw.main']?.size_actual ?? 0,
    }));
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
