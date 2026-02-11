import { S3ServiceException } from '@aws-sdk/client-s3';
import { MetricService, Traceable, WideContextRepository } from '@common/server/otel';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Counter } from '@opentelemetry/api';
import { Readable } from 'node:stream';
import { BlobInfoResponseDto } from 'src/dto/app.dto';
import { AuthDto } from 'src/dto/auth.dto';
import { BlobType } from 'src/enum';
import { ChecksumMismatchError, S3Error } from 'src/errors';
import { StorageRepository } from 'src/repositories/storage.repository';
import { attachMeterToStream, contextFromAuth } from 'src/utils/meters';
import { attachMeterToS3Object, S3RemoteObject } from 'src/utils/s3';

@Traceable()
@Injectable()
export class AppService {
  blobsRequestedBytes: Counter;
  blobsDownloadedBytes: Counter;
  blobsUploadedBytes: Counter;

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
      return attachMeterToS3Object(
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
      await this.storage.putObject(
        auth.repository,
        'config',
        attachMeterToStream(body, this.blobsUploadedBytes, contextFromAuth(auth)),
        auth.writeOnce,
      );
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
      await this.storage.deleteObject(auth.repository, 'config');
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
      return attachMeterToS3Object(
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
      await this.storage.putObject(
        auth.repository,
        `${type}/${name}`,
        attachMeterToStream(body, this.blobsUploadedBytes, contextFromAuth(auth)),
        auth.writeOnce,
        name,
      );
    } catch (error) {
      this.wideContext.setErrorCause(error);

      if (error instanceof ChecksumMismatchError) {
        throw new BadRequestException('Content hash does not match blob name');
      }

      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) {
        throw new ForbiddenException('Blob already exists');
      }

      throw new S3Error();
    }
  }

  async deleteBlob(auth: AuthDto, type: BlobType, name: string): Promise<void> {
    if (auth.writeOnce && type !== BlobType.Locks) {
      throw new ForbiddenException('Not permitted to write to WORM repository');
    }

    try {
      await this.storage.deleteObject(auth.repository, `${type}/${name}`);
    } catch (error) {
      this.wideContext.setErrorCause(error);

      throw new S3Error();
    }
  }
}
