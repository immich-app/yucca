import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql, Updateable } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
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
      .select((eb) => [
        'users.id',
        'users.sub',
        'users.name',
        'users.email',
        'sessions.id as sessionId',
        'sessions.connectionId as connectionId',
        'connections.lastSeenAt as connectionLastSeenAt',
        jsonArrayFrom(
          eb
            .selectFrom('userFeatureFlagOverride')
            .select(['flag', 'value'])
            .whereRef('userFeatureFlagOverride.userId', '=', 'users.id'),
        )
          .$castTo<{ flag: string; value: boolean }[]>()
          .as('featureOverrides'),
      ])
      .executeTakeFirst();
  }

  getFeatureOverrides(userId: string) {
    return this.db
      .selectFrom('userFeatureFlagOverride')
      .select(['flag', 'value'])
      .where('userId', '=', userId)
      .execute();
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
