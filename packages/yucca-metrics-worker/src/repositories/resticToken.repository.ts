import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class ResticTokenRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getRevokedUnexpired() {
    return this.db
      .selectFrom('resticTokens')
      .select(['jti', 'expiresAt'])
      .where('revokedAt', 'is not', null)
      .where('expiresAt', '>', new Date())
      .execute();
  }
}
