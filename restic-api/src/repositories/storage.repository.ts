import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import env from 'src/env';

@Injectable()
export class StorageRepository {
  client: S3Client;

  constructor() {
    this.client = new S3Client({
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  checkBucket(Bucket: string): Promise<boolean> {
    return this.client
      .send(
        new HeadBucketCommand({
          Bucket,
        }),
      )
      .then(() => true)
      .catch(() => false);
  }

  createBucket(Bucket: string) {
    return this.client.send(
      new CreateBucketCommand({
        Bucket,
      }),
    );
  }

  putObject(Bucket: string, Key: string, Body: Buffer) {
    return this.client.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body,
      }),
    );
  }

  headObject(Bucket: string, Key: string) {
    return this.client.send(
      new HeadObjectCommand({
        Bucket,
        Key,
      }),
    );
  }

  async listObjects(Bucket: string, Prefix: string) {
    return await this.client.send(
      new ListObjectsV2Command({
        Bucket,
        Prefix,
      }),
    );
  }

  async getObjectStream(Bucket: string, Key: string, Range?: string) {
    const Object = await this.client.send(
      new GetObjectCommand({
        Bucket,
        Key,
        Range,
      }),
    );

    const webStream = Object.Body?.transformToWebStream();
    return webStream ? Readable.fromWeb(webStream as ReadableStream) : undefined;
  }

  deleteObject(Bucket: string, Key: string) {
    return this.client.send(
      new DeleteObjectCommand({
        Bucket,
        Key,
      }),
    );
  }
}
