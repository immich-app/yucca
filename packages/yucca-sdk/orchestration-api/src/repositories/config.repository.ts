import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { ConfigurationKey } from '../enum';
import { DB } from '../schema';

@Injectable()
export class ConfigRepository implements OnModuleInit {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async onModuleInit() {
    const hasKey = await this.hasEncryptionKey();

    if (!hasKey) {
      await this.set(ConfigurationKey.EncryptionKey, randomBytes(64).toString('hex'));
    }
  }

  private async set(key: ConfigurationKey, value: string) {
    await this.db
      .insertInto('config')
      .values({
        key,
        value,
      })
      .onConflict((oc) => oc.doUpdateSet({ value }))
      .executeTakeFirstOrThrow();
  }

  private async get(key: ConfigurationKey) {
    const { value } = await this.db
      .selectFrom('config')
      .where('config.key', '=', key)
      .select('config.value')
      .executeTakeFirstOrThrow();

    return value;
  }

  private async has(key: ConfigurationKey) {
    const results = await this.db.selectFrom('config').where('config.key', '=', key).selectAll().execute();

    return results.length > 0;
  }

  async hasEncryptionKey() {
    return this.has(ConfigurationKey.EncryptionKey);
  }

  async getEncryptionKeyAsString(): Promise<string> {
    return await this.get(ConfigurationKey.EncryptionKey);
  }

  async getEncryptionKey(): Promise<Buffer> {
    const encryptionKey = await this.get(ConfigurationKey.EncryptionKey);
    return Buffer.from(encryptionKey, 'hex');
  }

  async importEncryptionKey(key: string): Promise<void> {
    await this.set(ConfigurationKey.EncryptionKey, key);
  }

  async hasOnboardedKey() {
    return this.has(ConfigurationKey.OnboardedKey);
  }

  async confirmKeyOnboarded() {
    return this.set(ConfigurationKey.OnboardedKey, '1');
  }
}
