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

  getByConnection(connectionId: string) {
    return this.db.selectFrom('resticTokens').selectAll().where('connectionId', '=', connectionId).execute();
  }

  get(jti: string) {
    return this.db.selectFrom('resticTokens').selectAll().where('jti', '=', jti).executeTakeFirst();
  }

  // Explicit columns: this feeds the user-facing ResticTokenDto verbatim, so keep
  // the selection in lockstep with it (no selectAll — it would leak userId/revokedBy).
  getByRepository(repositoryId: string) {
    return this.db
      .selectFrom('resticTokens')
      .select(['jti', 'repositoryId', 'connectionId', 'mintedBy', 'label', 'expiresAt', 'revokedAt', 'createdAt'])
      .where('repositoryId', '=', repositoryId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  getActiveByConnection(connectionId: string) {
    return this.db
      .selectFrom('resticTokens')
      .selectAll()
      .where('connectionId', '=', connectionId)
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
