import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class FeatureFlagRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByUser(userId: string) {
    return this.db
      .selectFrom('userFeatureFlagOverride')
      .select(['flag', 'value'])
      .where('userId', '=', userId)
      .execute();
  }
}
