import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { UserTable } from 'src/schema/tables/user.table';

@Injectable()
export class UserRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(user: Insertable<UserTable>) {
    return this.db.insertInto('users').values(user).returningAll().executeTakeFirstOrThrow();
  }

  getBySub(sub: string) {
    return this.db.selectFrom('users').select(['id', 'disabled']).where('sub', '=', sub).executeTakeFirst();
  }

  getByAccessToken(accessToken: string) {
    return this.db
      .selectFrom('sessions')
      .where('accessToken', '=', accessToken)
      .innerJoin('users', 'users.id', 'sessions.userId')
      .leftJoin('connections', 'connections.id', 'sessions.connectionId')
      .where('users.disabled', '=', false)
      .select([
        'users.id',
        'users.sub',
        'users.name',
        'users.email',
        'sessions.id as sessionId',
        'sessions.connectionId as connectionId',
        'connections.lastSeenAt as connectionLastSeenAt',
      ])
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
