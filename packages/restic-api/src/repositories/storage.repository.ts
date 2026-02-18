import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { env } from '@common/server/env';
import { Traceable } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { ChecksumMismatchError } from 'src/errors';

@Traceable()
@Injectable()
export class StorageRepository {
  private client: S3Client;

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

  async checkBucket(Bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket }));
      return true;
    } catch (error) {
      if (error instanceof NotFound) {
        return false;
      }
      throw error;
    }
  }

  createBucket(Bucket: string) {
    return this.client.send(
      new CreateBucketCommand({
        Bucket,
      }),
    );
  }

  async putObject(Bucket: string, Key: string, Body: Readable, writeOnce: boolean, sha256Hex?: string) {
    const hash = sha256Hex ? createHash('sha256') : undefined;

    const params: PutObjectCommandInput = {
      Bucket,
      Key,
      Body: hash
        ? Body.pipe(
            new Transform({
              transform(chunk, _, callback) {
                hash.update(chunk);
                callback(null, chunk);
              },
            }),
          )
        : Body,
    };

    if (writeOnce) {
      params.IfNoneMatch = '*';
    }

    const upload = new Upload({
      client: this.client,
      params,
    });

    await upload.done();

    if (hash && hash.digest('hex') !== sha256Hex) {
      await this.deleteObject(Bucket, Key);
      throw new ChecksumMismatchError();
    }
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

  async getObject(Bucket: string, Key: string, Range?: string) {
    return await this.client.send(
      new GetObjectCommand({
        Bucket,
        Key,
        Range,
      }),
    );
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
