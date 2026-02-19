import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { ConfigurationKey } from '../enum';
import { DB } from '../schema';

@Injectable()
export class ConfigRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

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

  async getEncryptionKey(): Promise<Buffer> {
    const encryptionKey = await this.get(ConfigurationKey.EncryptionKey);
    return Buffer.from(encryptionKey.toString(), 'hex');
  }
}
