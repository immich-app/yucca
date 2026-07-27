import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class ConsumerRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByUser(userId: string) {
    return this.db
      .selectFrom('consumers')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async getOrCreateByType(userId: string, type: string, name: string) {
    const existing = await this.db
      .selectFrom('consumers')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', type)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .executeTakeFirst();

    return (
      existing ??
      (await this.db.insertInto('consumers').values({ userId, type, name }).returningAll().executeTakeFirstOrThrow())
    );
  }
}
