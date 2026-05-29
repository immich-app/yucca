import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class SessionRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByUser(userId: string) {
    return this.db.selectFrom('sessions').select(['id', 'userId']).where('userId', '=', userId).execute();
  }

  delete(id: string) {
    return this.db.deleteFrom('sessions').where('id', '=', id).execute();
  }

  deleteByUser(userId: string) {
    return this.db.deleteFrom('sessions').where('userId', '=', userId).execute();
  }
}
