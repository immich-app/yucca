import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { UserTable } from 'src/schema/tables/user.table';

@Injectable()
export class UserRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(user: Insertable<UserTable>) {
    return this.db.insertInto('users').values(user).returning('id').executeTakeFirstOrThrow();
  }

  getBySub(sub: string) {
    return this.db.selectFrom('users').select('id').where('sub', '=', sub).executeTakeFirst();
  }

  getBySessionToken(accessToken: string) {
    return this.db
      .selectFrom('sessions')
      .where('accessToken', '=', accessToken)
      .innerJoin('users', 'users.id', 'sessions.userId')
      .selectAll('users')
      .select(['sessions.id as sessionId'])
      .executeTakeFirst();
  }

  update(id: string, user: Updateable<UserTable>) {
    return this.db
      .updateTable('users')
      .set(user)
      .where('id', '=', sql<string>`${id}::uuid`)
      .returning('id')
      .executeTakeFirst();
  }
}
