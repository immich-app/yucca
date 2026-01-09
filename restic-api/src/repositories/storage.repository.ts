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

@Injectable()
export class StorageRepository {
  client: S3Client;

  constructor() {
    this.client = new S3Client({
      credentials: {
        accessKeyId: 'minio',
        secretAccessKey: 'miniominio',
      },
      region: 'minio',
      endpoint: 'http://127.0.0.1:9000',
      forcePathStyle: true,
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

  async getObjectAsByteArray(Bucket: string, Key: string) {
    const Object = await this.client.send(
      new GetObjectCommand({
        Bucket,
        Key,
      }),
    );

    return await Object.Body?.transformToByteArray();
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
