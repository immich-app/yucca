import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class UserAllowlistRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByEmail(email: string) {
    return this.db.selectFrom('userAllowlist').selectAll().where('email', '=', email).executeTakeFirst();
  }

  getByInviteCode(inviteCode: string) {
    return this.db.selectFrom('userAllowlist').selectAll().where('inviteCode', '=', inviteCode).executeTakeFirst();
  }

  markUsed(id: string) {
    return this.db
      .updateTable('userAllowlist')
      .set({ inviteUsed: true, inviteUsedAt: new Date() })
      .where('id', '=', sql<string>`${id}::uuid`)
      .returning('id')
      .executeTakeFirst();
  }
}
