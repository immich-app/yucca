import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { ConfigurationKey } from '../enum';
import { DB } from '../schema';

@Injectable()
export class ConfigRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async bootstrap() {
    const hasKey = await this.hasEncryptionKey();

    if (!hasKey) {
      await this.set(ConfigurationKey.EncryptionKey, randomBytes(32).toString('hex'));
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

  async getMasterEncryptionKey(): Promise<string> {
    return await this.get(ConfigurationKey.EncryptionKey);
  }

  async deriveEncryptionKey(info: `repository-${string}`): Promise<Uint8Array> {
    const encryptionKey = await this.get(ConfigurationKey.EncryptionKey);
    const masterKey = Buffer.from(encryptionKey, 'hex');

    const key = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          info: Buffer.from(info),
          salt: Buffer.from(Array.from({ length: 32 }).fill(0) as number[]),
        },
        await crypto.subtle.importKey('raw', masterKey, 'HKDF', false, ['deriveBits']),
        256,
      ),
    );

    return key;
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

  async hasSkippedExtraConfig() {
    return this.has(ConfigurationKey.SkippedOnboardingExtraConfig);
  }

  async skipExtraConfig() {
    return this.set(ConfigurationKey.SkippedOnboardingExtraConfig, '1');
  }
}
