import { Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { env } from 'src/env';

@Injectable()
export class TranscriptStorageRepository {
  private aws: AwsClient | null = null;

  get enabled(): boolean {
    return Boolean(
      env.TRANSCRIPT_S3_ENDPOINT &&
      env.TRANSCRIPT_S3_BUCKET &&
      env.TRANSCRIPT_S3_ACCESS_KEY_ID &&
      env.TRANSCRIPT_S3_SECRET_ACCESS_KEY,
    );
  }

  async put(key: string, body: string): Promise<void> {
    this.aws ??= new AwsClient({
      accessKeyId: env.TRANSCRIPT_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.TRANSCRIPT_S3_SECRET_ACCESS_KEY!,
      service: 's3',
      region: env.TRANSCRIPT_S3_REGION,
    });

    const url = new URL(env.TRANSCRIPT_S3_ENDPOINT!.href);
    url.pathname = `/${env.TRANSCRIPT_S3_BUCKET}/${key}`;

    const response = await this.aws.fetch(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    });
    if (!response.ok) {
      throw new Error(
        `transcript upload of ${key} failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }
  }
}
