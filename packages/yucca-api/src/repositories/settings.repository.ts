import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import type { ConfigOverrides } from 'src/utils/settings';

@Injectable()
export class SettingsRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  list() {
    return this.db.selectFrom('settings').selectAll().orderBy('scope', 'asc').execute();
  }

  async getAll(): Promise<Record<string, ConfigOverrides>> {
    const rows = await this.db.selectFrom('settings').selectAll().execute();
    return Object.fromEntries(rows.map((row) => [row.scope, row.value]));
  }

  async get(scope: string): Promise<ConfigOverrides | undefined> {
    const row = await this.db.selectFrom('settings').selectAll().where('scope', '=', scope).executeTakeFirst();
    return row?.value;
  }

  set(scope: string, value: ConfigOverrides) {
    return this.db
      .insertInto('settings')
      .values({ scope, value })
      .onConflict((oc) => oc.column('scope').doUpdateSet({ value, updatedAt: new Date() }))
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(scope: string): Promise<void> {
    await this.db.deleteFrom('settings').where('scope', '=', scope).execute();
  }
}
