import { GetObjectCommandOutput, S3ServiceException } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Counter } from '@opentelemetry/api';
import { MetricService, Traceable } from 'nestjs-otel';
import { Readable, Transform } from 'node:stream';
import { BlobInfoResponseDto } from 'src/dto/app.dto';
import { BlobType } from 'src/enum';
import { S3Error } from 'src/errors';
import { StorageRepository } from 'src/repositories/storage.repository';

@Traceable()
@Injectable()
export class AppService {
  private blobsRequested: Counter;
  private blobsRequestedBytes: Counter;
  private blobsUploaded: Counter;
  private blobsUploadedBytes: Counter;

  constructor(
    private readonly metricService: MetricService,
    private readonly storage: StorageRepository,
  ) {
    this.blobsRequested = this.metricService.getCounter('blobs.requested', {
      description: 'Total no. of blobs requested for download',
    });

    this.blobsRequestedBytes = this.metricService.getCounter('blobs.requested_bytes', {
      description: 'Total no. of blob bytes requested for download',
    });

    this.blobsUploaded = this.metricService.getCounter('blobs.uploaded', {
      description: 'Total no. of blobs uploaded',
    });

    this.blobsUploadedBytes = this.metricService.getCounter('blobs.uploaded_bytes', {
      description: 'Total no. of blob bytes uploaded',
    });
  }

  async createRepository(repository: string, isCreate: boolean): Promise<void> {
    if (!isCreate) {
      throw new BadRequestException('Must specify isCreate=true');
    }

    let exists: boolean;
    try {
      exists = await this.storage.checkBucket(repository);
    } catch (error) {
      throw new S3Error(error);
    }

    if (exists) {
      throw new ConflictException('The repository already exists.');
    }

    try {
      await this.storage.createBucket(repository);
    } catch (error) {
      throw new S3Error(error);
    }
  }

  deleteRepository(): void {}

  async checkConfig(path: string): Promise<number> {
    try {
      const { ContentLength } = await this.storage.headObject(path, 'config');
      return ContentLength || 0;
    } catch (error) {
      throw new NotFoundException('Config does not exist', { cause: error });
    }
  }

  async getConfig(path: string): Promise<GetObjectCommandOutput> {
    try {
      return await this.storage.getObject(path, 'config');
    } catch (error) {
      throw new S3Error(error);
    }
  }

  async saveConfig(path: string, body: Readable, writeOnce: boolean): Promise<void> {
    try {
      await this.storage.putObject(path, 'config', body, writeOnce);
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) {
        throw new ForbiddenException('Repository config already exists', { cause: error });
      }

      throw new S3Error(error);
    }
  }

  async deleteConfig(path: string, writeOnce: boolean): Promise<void> {
    if (writeOnce) {
      throw new ForbiddenException();
    }

    try {
      await this.storage.deleteObject(path, 'config');
    } catch (error) {
      throw new S3Error(error);
    }
  }

  async listBlobs(path: string, type: BlobType): Promise<BlobInfoResponseDto[]> {
    try {
      const suffix = `${type}/`;
      const { Contents, KeyCount } = await this.storage.listObjects(path, suffix);

      if (KeyCount === 0) {
        return [];
      }

      if (!Contents || Contents.some(({ Key, Size }) => !Key || !Size)) {
        throw void 0;
      }

      return Contents!.map(({ Key, Size }) => ({
        name: Key!.slice(suffix.length),
        size: Size!,
      }));
    } catch (error) {
      throw new S3Error(error);
    }
  }

  async checkBlob(path: string, type: BlobType, name: string): Promise<number> {
    try {
      const { ContentLength } = await this.storage.headObject(path, `${type}/${name}`);
      return ContentLength || 0;
    } catch (error) {
      throw new NotFoundException('Could not find the requested blob', { cause: error });
    }
  }

  async getBlob(path: string, type: BlobType, name: string, range?: string): Promise<GetObjectCommandOutput> {
    try {
      const blob = await this.storage.getObject(path, `${type}/${name}`, range);
      this.blobsRequested.add(1);
      this.blobsRequestedBytes.add(blob.ContentLength ?? 0, {
        path,
      });
      return blob;
    } catch (error) {
      throw new S3Error(error);
    }
  }

  async saveBlob(path: string, type: BlobType, name: string, body: Readable, writeOnce: boolean): Promise<void> {
    try {
      const blobsUploadedBytes = this.blobsUploadedBytes;
      const stream = new Transform({
        transform(chunk, _, callback) {
          blobsUploadedBytes.add(chunk.length);
          callback(null, chunk);
        },
        flush(callback) {
          callback();
        },
      });

      body.pipe(stream);

      await this.storage.putObject(path, `${type}/${name}`, stream, writeOnce, name);

      this.blobsUploaded.add(1);
    } catch (error) {
      if (error instanceof S3ServiceException) {
        if (error.$metadata.httpStatusCode === 412) {
          throw new ForbiddenException('Blob already exists', { cause: error });
        }

        if (error.name === 'XAmzContentChecksumMismatch') {
          throw new BadRequestException('Content hash does not match blob name', { cause: error });
        }
      }

      throw new S3Error(error);
    }
  }

  async deleteBlob(path: string, type: BlobType, name: string, writeOnce: boolean): Promise<void> {
    if (writeOnce && type !== BlobType.Locks) {
      throw new ForbiddenException('Not allowed to delete data in WORM mode');
    }

    try {
      await this.storage.deleteObject(path, `${type}/${name}`);
    } catch (error) {
      throw new S3Error(error);
    }
  }
}
