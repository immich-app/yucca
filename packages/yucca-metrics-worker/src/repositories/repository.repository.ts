import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class RepositoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getAll() {
    return this.db.selectFrom('repositories').select(['id', 'userId', 'siteCode', 'storageClusterCode']).execute();
  }
}
