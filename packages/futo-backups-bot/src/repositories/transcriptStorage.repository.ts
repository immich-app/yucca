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
      accessKeyId: env.TRANSCRIPT_S3_ACCESS_KEY_ID,
      secretAccessKey: env.TRANSCRIPT_S3_SECRET_ACCESS_KEY,
      service: 's3',
      region: env.TRANSCRIPT_S3_REGION,
    });

    let response = await this.putObject(key, body);
    if (response.status === 404) {
      await this.createBucket();
      response = await this.putObject(key, body);
    }
    if (!response.ok) {
      throw new Error(
        `transcript upload of ${key} failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }
  }

  private putObject(key: string, body: string): Promise<Response> {
    return this.aws!.fetch(this.url(`/${key}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    });
  }

  private async createBucket(): Promise<void> {
    const response = await this.aws!.fetch(this.url(''), { method: 'PUT' });
    if (!response.ok && response.status !== 409) {
      throw new Error(
        `transcript bucket creation failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }
  }

  private url(suffix: string): string {
    const url = new URL(env.TRANSCRIPT_S3_ENDPOINT);
    url.pathname = `/${env.TRANSCRIPT_S3_BUCKET}${suffix}`;
    return url.toString();
  }
}
