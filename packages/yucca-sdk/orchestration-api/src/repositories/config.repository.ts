import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';

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
}
