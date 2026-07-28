import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class ResticTokenRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  // Tokens that should currently be honored: minted, not revoked, not expired.
  // Joined to their connection type so the reconcile can keep validity markers
  // only for revocable types (michael skips the check for the rest). A token
  // whose connection was deleted (connectionId SET NULL) has no type and is
  // excluded — an orphaned token cannot be a valid restic credential.
  getValidUnexpired() {
    return this.db
      .selectFrom('resticTokens')
      .innerJoin('connections', 'connections.id', 'resticTokens.connectionId')
      .select(['resticTokens.jti as jti', 'resticTokens.expiresAt as expiresAt', 'connections.type as connectionType'])
      .where('resticTokens.revokedAt', 'is', null)
      .where('resticTokens.expiresAt', '>', new Date())
      .execute();
  }
}
