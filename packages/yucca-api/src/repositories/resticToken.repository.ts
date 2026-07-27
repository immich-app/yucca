import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { ResticTokenTable } from 'src/schema/tables/resticToken.table';

@Injectable()
export class ResticTokenRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(token: Insertable<ResticTokenTable>) {
    return this.db.insertInto('resticTokens').values(token).returningAll().executeTakeFirstOrThrow();
  }

  getByConsumer(consumerId: string) {
    return this.db.selectFrom('resticTokens').selectAll().where('consumerId', '=', consumerId).execute();
  }

  getActiveByConsumer(consumerId: string) {
    return this.db
      .selectFrom('resticTokens')
      .selectAll()
      .where('consumerId', '=', consumerId)
      .where('revokedAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .execute();
  }

  async revoke(jti: string, revokedBy: string) {
    await this.db
      .updateTable('resticTokens')
      .set({ revokedAt: new Date(), revokedBy })
      .where('jti', '=', jti)
      .where('revokedAt', 'is', null)
      .execute();
  }
}
