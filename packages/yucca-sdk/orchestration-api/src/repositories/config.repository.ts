import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { RepositoryMetadataDto } from '../dto/repository.dto';

@Injectable()
export class ConfigRepository implements OnModuleInit {
  async onModuleInit() {
    try {
      await stat('.data');
    } catch {
      await mkdir('.data');
      await writeFile('.data/encryptionKey', randomBytes(32).toString('hex'));
    }
  }

  async setAccessToken(accessToken: string) {
    await writeFile('.data/accessToken', accessToken);
  }

  async getAccessToken() {
    try {
      const file = await readFile('.data/accessToken');
      return file.toString();
    } catch {
      return;
    }
  }

  async getAccessTokenOrThrow() {
    const file = await readFile('.data/accessToken');
    return file.toString();
  }

  async getEncryptionKey(): Promise<Buffer> {
    const file = await readFile('.data/encryptionKey');
    return Buffer.from(file.toString(), 'hex');
  }

  async getRecoveryKey(): Promise<string> {
    const file = await readFile('.data/encryptionKey');
    return file.toString().toUpperCase();
  }

  async saveRepositoryMetadata(repository: string, metadata: RepositoryMetadataDto) {
    await writeFile(
      '.data/repositoryMetadata',
      JSON.stringify({
        ...(await this.getRepositoryMetadata()),
        [repository]: metadata,
      }),
    );
  }

  async getRepositoryMetadata(): Promise<Record<string, RepositoryMetadataDto>> {
    try {
      const file = await readFile('.data/repositoryMetadata');
      return JSON.parse(file.toString());
    } catch {
      return {};
    }
  }
}
