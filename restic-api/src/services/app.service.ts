import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LoggerRepository } from 'src/repositories/logger.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { BlobType } from 'src/validation';

export interface BlobInfo {
  name: string;
  size: number;
}

@Injectable()
export class AppService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly storage: StorageRepository,
  ) {
    logger.setContext('AppService');
  }

  async createRepository(repository: string, isCreate: boolean): Promise<void> {
    if (!isCreate) {
      throw new BadRequestException();
    }

    this.logger.debug(`Creating a new repository at ${repository}`);

    if (await this.storage.checkBucket(repository)) {
      throw new ConflictException();
    }

    await this.storage.createBucket(repository);
  }

  deleteRepository(): void {
    this.logger.debug('Ignoring repository delete request');
  }

  async checkConfig(path: string): Promise<number> {
    this.logger.debug(`Checking config at ${path}`);

    try {
      const { ContentLength } = await this.storage.headObject(path, 'config');
      return ContentLength || 0;
    } catch {
      throw new NotFoundException();
    }
  }

  async getConfig(path: string): Promise<Uint8Array> {
    this.logger.debug(`Reading repository config at ${path}`);
    const buffer = await this.storage.getObjectAsByteArray(path, 'config');

    if (!buffer) {
      throw new InternalServerErrorException();
    }

    return buffer;
  }

  saveConfig(path: string, body: Buffer): Promise<unknown> {
    this.logger.debug(`Writing config to repository at ${path}`);
    return this.storage.putObject(path, 'config', body);
  }

  async listBlobs(path: string, type: BlobType): Promise<BlobInfo[]> {
    this.logger.debug(`Listing repository blobs at ${path} for ${type}`);

    const suffix = `${type}/`;
    const { Contents, KeyCount } = await this.storage.listObjects(path, suffix);

    if (KeyCount === 0) {
      return [];
    }

    return Contents!.map(({ Key, Size }) => ({
      name: Key!.slice(suffix.length),
      size: Size!,
    }));
  }

  async checkBlob(path: string, type: BlobType, name: string): Promise<number> {
    this.logger.debug(`Checking repository blob at ${path} for ${type}/${name}`);

    try {
      const { ContentLength } = await this.storage.headObject(path, `${type}/${name}`);
      return ContentLength || 0;
    } catch {
      throw new NotFoundException();
    }
  }

  async getBlob(path: string, type: BlobType, name: string, range?: string): Promise<Uint8Array> {
    this.logger.debug(`Downloading repository blob at ${path} for ${type}/${name} (range = ${range})`);
    const buffer = await this.storage.getObjectAsByteArray(path, `${type}/${name}`, range);

    if (!buffer) {
      throw new InternalServerErrorException('Object is missing');
    }

    return buffer;
  }

  saveBlob(path: string, type: BlobType, name: string, body: Buffer): Promise<unknown> {
    this.logger.debug(`Uploading repository blob at ${path} for ${type}/${name} (length = ${body.length})`);
    return this.storage.putObject(path, `${type}/${name}`, body);
  }

  deleteBlob(path: string, type: BlobType, name: string): Promise<unknown> {
    this.logger.debug(`Deleting repository blob at ${path} for ${type}/${name}`);
    return this.storage.deleteObject(path, `${type}/${name}`);
  }
}
