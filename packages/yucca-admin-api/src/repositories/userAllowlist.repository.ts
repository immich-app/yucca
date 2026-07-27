import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { UserAllowlistTable } from 'src/schema/tables/userAllowlist.table';
import { toCursorPage } from 'src/utils/pagination';

@Injectable()
export class UserAllowlistRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async list({ cursor, limit }: { cursor?: string; limit: number }) {
    const rows = await this.db
      .selectFrom('userAllowlist')
      .selectAll()
      .orderBy('id', 'asc')
      .limit(limit + 1)
      .$if(cursor !== undefined, (qb) => qb.where('id', '>', cursor!))
      .execute();

    return toCursorPage(rows, limit);
  }

  getByEmail(email: string) {
    return this.db.selectFrom('userAllowlist').selectAll().where('email', '=', email).executeTakeFirst();
  }

  create(entry: Insertable<UserAllowlistTable>) {
    return this.db.insertInto('userAllowlist').values(entry).returningAll().executeTakeFirstOrThrow();
  }

  update(id: string, entry: Updateable<UserAllowlistTable>) {
    return this.db
      .updateTable('userAllowlist')
      .where('id', '=', id)
      .set(entry)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  deleteByEmail(email: string) {
    return this.db.deleteFrom('userAllowlist').where('email', '=', email).returning('id').executeTakeFirst();
  }

  oldestStaged(count: number) {
    return this.db
      .selectFrom('userAllowlist')
      .selectAll()
      .where('invited', '=', false)
      .orderBy('createdAt', 'asc')
      .limit(count)
      .execute();
  }
}
