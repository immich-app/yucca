import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class FeatureFlagRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByUser(userId: string) {
    return this.db
      .selectFrom('userFeatureFlagOverride')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('flag', 'asc')
      .execute();
  }

  upsert(userId: string, flag: string, value: boolean, setBy: string, reason?: string) {
    return this.db
      .insertInto('userFeatureFlagOverride')
      .values({ userId, flag, value, setBy, reason: reason ?? null })
      .onConflict((oc) =>
        oc.columns(['userId', 'flag']).doUpdateSet({ value, setBy, reason: reason ?? null, updatedAt: new Date() }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(userId: string, flag: string) {
    await this.db
      .deleteFrom('userFeatureFlagOverride')
      .where('userId', '=', sql<string>`${userId}::uuid`)
      .where('flag', '=', flag)
      .execute();
  }

  countsByFlag() {
    return this.db
      .selectFrom('userFeatureFlagOverride')
      .select(['flag'])
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .groupBy('flag')
      .execute();
  }

  listByFlag(flag: string) {
    return this.db
      .selectFrom('userFeatureFlagOverride')
      .innerJoin('users', 'users.id', 'userFeatureFlagOverride.userId')
      .where('flag', '=', flag)
      .select([
        'userFeatureFlagOverride.userId',
        'users.email',
        'userFeatureFlagOverride.value',
        'userFeatureFlagOverride.setBy',
        'userFeatureFlagOverride.reason',
        'userFeatureFlagOverride.updatedAt',
      ])
      .orderBy('users.email', 'asc')
      .execute();
  }

  usersWithoutOverride(flag: string, count: number) {
    return this.db
      .selectFrom('users')
      .where('users.disabled', '=', false)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('userFeatureFlagOverride')
              .select('userFeatureFlagOverride.id')
              .whereRef('userFeatureFlagOverride.userId', '=', 'users.id')
              .where('userFeatureFlagOverride.flag', '=', flag),
          ),
        ),
      )
      .select(['users.id', 'users.email'])
      .orderBy('users.createdAt', 'asc')
      .orderBy('users.id', 'asc')
      .limit(count)
      .execute();
  }
}
