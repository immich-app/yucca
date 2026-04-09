import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { RepositoryPathTable } from '../schema/tables/repositoryPath.table';

@Injectable()
export class RepositoryPathRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(entry: Insertable<RepositoryPathTable>) {
    return this.db.insertInto('repositoryPaths').values(entry).returningAll().executeTakeFirstOrThrow();
  }

  async get(id: string) {
    const result = await this.db.selectFrom('repositoryPaths').select('path').where('id', '=', id).execute();
    return result.map(({ path }) => path);
  }

  getAll() {
    return this.db.selectFrom('repositoryPaths').selectAll().execute();
  }

  delete(id: string, path: string) {
    return this.db
      .deleteFrom('repositoryPaths')
      .where('id', '=', id)
      .where('path', '=', path)
      .executeTakeFirstOrThrow();
  }
}
