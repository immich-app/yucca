import { Injectable } from '@nestjs/common';
import { Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { UserTable } from 'src/schema/tables/user.table';
import { toCursorPage } from 'src/utils/pagination';

@Injectable()
export class UserRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async list({ cursor, limit }: { cursor?: string; limit: number }) {
    const rows = await this.db
      .selectFrom('users')
      .select(['id', 'sub', 'name', 'email', 'disabled'])
      .orderBy('id', 'asc')
      .limit(limit + 1)
      .$if(cursor !== undefined, (qb) => qb.where('id', '>', cursor!))
      .execute();

    return toCursorPage(rows, limit);
  }

  get(id: string) {
    return this.db
      .selectFrom('users')
      .select(['id', 'sub', 'name', 'email', 'disabled'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  }

  update(id: string, user: Updateable<UserTable>) {
    return this.db.updateTable('users').where('id', '=', id).set(user).execute();
  }

  delete(id: string) {
    return this.db.deleteFrom('users').where('id', '=', id).execute();
  }

  async hasRepositories(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('repositories')
      .where('userId', '=', userId)
      .select('id')
      .limit(1)
      .executeTakeFirst();

    return row !== undefined;
  }
}
