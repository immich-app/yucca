import { S3ServiceException } from '@aws-sdk/client-s3';
import { MetricService, Traceable, WideContextRepository } from '@common/server/otel';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Counter, UpDownCounter } from '@opentelemetry/api';
import { Readable } from 'node:stream';
import { BlobInfoResponseDto } from 'src/dto/app.dto';
import { AuthDto } from 'src/dto/auth.dto';
import { BlobType } from 'src/enum';
import { ChecksumMismatchError, S3Error } from 'src/errors';
import { StorageRepository } from 'src/repositories/storage.repository';
import { attachMeterToStream, contextFromAuth } from 'src/utils/meters';
import { attachMeterToS3GetObject, S3RemoteObject } from 'src/utils/s3';

@Traceable()
@Injectable()
export class AppService {
  blobsRequestedBytes: Counter;
  blobsDownloadedBytes: Counter;
  blobsUploadedBytes: Counter;
  blobsStoredBytes: UpDownCounter;

  constructor(
    private readonly storage: StorageRepository,
    private readonly metricService: MetricService,
    private readonly wideContext: WideContextRepository,
  ) {
    this.blobsRequestedBytes = this.metricService.getCounter('blobs.requested_bytes', {
      description: 'Total no. of blob bytes requested for download',
    });

    this.blobsDownloadedBytes = this.metricService.getCounter('blobs.downloaded_bytes', {
      description: 'Total no. of blob bytes download',
    });

    this.blobsUploadedBytes = this.metricService.getCounter('blobs.uploaded_bytes', {
      description: 'Total no. of blob bytes uploaded',
    });

    this.blobsStoredBytes = this.metricService.getUpDownCounter('blobs.stored_bytes', {
      description: 'Total no. of blob bytes stored',
    });
  }

  async createRepository(repository: string, isCreate: boolean): Promise<void> {
    if (!isCreate) {
      throw new BadRequestException('isCreate must be true when creating repository');
    }

    let exists: boolean;
    try {
      exists = await this.storage.checkBucket(repository);
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new S3Error();
    }

    if (exists) {
      throw new ConflictException('Repository already exists');
    }

    try {
      await this.storage.createBucket(repository);
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new S3Error();
    }
  }

  deleteRepository(): void {}

  async checkConfig(auth: AuthDto): Promise<number> {
    try {
      const { ContentLength } = await this.storage.headObject(auth.repository, 'config');
      return ContentLength || 0;
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new NotFoundException();
    }
  }

  async getConfig(auth: AuthDto): Promise<S3RemoteObject> {
    try {
      return attachMeterToS3GetObject(
        auth,
        await this.storage.getObject(auth.repository, 'config'),
        this.blobsRequestedBytes,
        this.blobsDownloadedBytes,
      );
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new S3Error();
    }
  }

  async saveConfig(auth: AuthDto, body: Readable): Promise<void> {
    try {
      let stored = 0;

      await this.storage.putObject(
        auth.repository,
        'config',
        attachMeterToStream(body, this.blobsUploadedBytes, (bytes) => (stored += bytes), contextFromAuth(auth)),
        auth.writeOnce,
      );

      this.blobsStoredBytes.add(stored, contextFromAuth(auth));
    } catch (error) {
      this.wideContext.setErrorCause(error);

      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) {
        throw new ForbiddenException('Config already exists');
      }

      throw new S3Error();
    }
  }

  async deleteConfig(auth: AuthDto): Promise<void> {
    if (auth.writeOnce) {
      throw new ForbiddenException('Not permitted to write to WORM repository');
    }

    try {
      const { ContentLength } = await this.storage.headObject(auth.repository, 'config');

      if (!ContentLength) {
        throw 'Missing ContentLength from headObject output';
      }

      await this.storage.deleteObject(auth.repository, 'config');

      this.blobsStoredBytes.add(-ContentLength, contextFromAuth(auth));
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new S3Error();
    }
  }

  async listBlobs(auth: AuthDto, type: BlobType): Promise<BlobInfoResponseDto[]> {
    try {
      const suffix = `${type}/`;
      const { Contents, KeyCount } = await this.storage.listObjects(auth.repository, suffix);

      if (KeyCount === 0) {
        return [];
      }

      if (!Contents) {
        this.wideContext.setErrorCause('Contents missing from ListObjects response');
        throw void 0;
      }

      if (Contents.some(({ Key, Size }) => !Key || !Size)) {
        this.wideContext.setErrorCause('Contents are malformed from ListObjects response');
        this.wideContext.addContext('contents', Contents);
        throw void 0;
      }

      return Contents!.map(({ Key, Size }) => ({
        name: Key!.slice(suffix.length),
        size: Size!,
      }));
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new S3Error();
    }
  }

  async checkBlob(auth: AuthDto, type: BlobType, name: string): Promise<number> {
    try {
      const { ContentLength } = await this.storage.headObject(auth.repository, `${type}/${name}`);
      return ContentLength || 0;
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new NotFoundException();
    }
  }

  async getBlob(auth: AuthDto, type: BlobType, name: string, range?: string): Promise<S3RemoteObject> {
    try {
      return attachMeterToS3GetObject(
        auth,
        await this.storage.getObject(auth.repository, `${type}/${name}`, range),
        this.blobsRequestedBytes,
        this.blobsDownloadedBytes,
      );
    } catch (error) {
      this.wideContext.setErrorCause(error);
      throw new S3Error();
    }
  }

  async saveBlob(auth: AuthDto, type: BlobType, name: string, body: Readable): Promise<void> {
    try {
      let stored = 0;

      await this.storage.putObject(
        auth.repository,
        `${type}/${name}`,
        attachMeterToStream(body, this.blobsUploadedBytes, (bytes) => (stored += bytes), contextFromAuth(auth)),
        true,
        name,
      );

      this.blobsStoredBytes.add(stored, contextFromAuth(auth));
    } catch (error) {
      this.wideContext.setErrorCause(error);

      if (error instanceof ChecksumMismatchError) {
        throw error;
      }

      if (error instanceof S3ServiceException) {
        if (error.$metadata.httpStatusCode === 412) {
          throw new ForbiddenException('Blob already exists');
        }

        if (error.name === 'XAmzContentChecksumMismatch') {
          throw new BadRequestException('Content hash does not match blob name');
        }
      }

      throw new S3Error();
    }
  }

  async deleteBlob(auth: AuthDto, type: BlobType, name: string): Promise<void> {
    if (auth.writeOnce && type !== BlobType.Locks) {
      throw new ForbiddenException('Not permitted to write to WORM repository');
    }

    try {
      const { ContentLength } = await this.storage.headObject(auth.repository, `${type}/${name}`);

      if (!ContentLength) {
        throw 'Missing ContentLength from headObject output';
      }

      await this.storage.deleteObject(auth.repository, `${type}/${name}`);

      this.blobsStoredBytes.add(-ContentLength, contextFromAuth(auth));
    } catch (error) {
      this.wideContext.setErrorCause(error);

      throw new S3Error();
    }
  }
}
