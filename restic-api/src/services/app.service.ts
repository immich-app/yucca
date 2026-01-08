import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { LoggerRepository } from 'src/repositories/logger.repository';
import { StorageRepository } from 'src/repositories/storage.repository';

const DIR_MODE = 0o700;
const OBJECT_TYPES = ['data', 'index', 'keys', 'locks', 'snapshots'] as const;

export type BlobType = (typeof OBJECT_TYPES)[number];

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

  createRepository(path: string, isCreate: boolean): void {
    if (!isCreate) {
      throw new BadRequestException();
    }

    this.logger.debug(`Creating a new repository at ${path}`);
  }

  deleteRepository(): void {
    this.logger.debug('Ignoring repository delete request');
  }

  checkConfig(path: string): number {
    this.logger.debug(`Checking config at ${path}`);

    try {
      return this.storage.length(`${path}/config`);
    } catch {
      throw new NotFoundException();
    }
  }

  getConfig(path: string): Buffer {
    this.logger.debug(`Reading repository config at ${path}`);
    return this.storage.read(`${path}/config`);
  }

  saveConfig(path: string, body: Buffer): void {
    this.logger.debug(`Writing config to repository at ${path}`);
    this.storage.write(`${path}/config`, body);
  }

  listBlobs(path: string, type: BlobType): BlobInfo[] {
    this.logger.debug(`Listing repository blobs at ${path} for ${type}`);

    return this.storage.list(path, type).map((name) => ({
      name,
      size: this.storage.length(`${path}/${type}/${name}`),
    }));
  }

  checkBlob(path: string, type: BlobType, name: string): number {
    this.logger.debug(`Checking repository blob at ${path} for ${type}/${name}`);

    try {
      return this.storage.length(`${path}/config`);
    } catch {
      throw new NotFoundException();
    }
  }

  getBlob(path: string, type: BlobType, name: string, range?: string): Buffer {
    this.logger.debug(`Downloading repository blob at ${path} for ${type}/${name} (range = ${range})`);
    return this.storage.read(`${path}/${type}/${name}`);
  }

  saveBlob(path: string, type: BlobType, name: string, body: Buffer): void {
    this.logger.debug(`Uploading repository blob at ${path} for ${type}/${name} (length = ${body.length})`);
    this.storage.write(`${path}/${type}/${name}`, body);
  }

  deleteBlob(path: string, type: BlobType, name: string): void {
    this.logger.debug(`Deleting repository blob at ${path} for ${type}/${name}`);

    this.storage.delete(`${path}/${type}/${name}`);
  }
}
