import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { RepositoryTable } from '../schema/tables/repository.table';

@Injectable()
export class RepositoryRepository {
  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  create(repository: Insertable<RepositoryTable>) {
    return this.db.insertInto('repositories').values(repository).returningAll().executeTakeFirstOrThrow();
  }

  get(id: string) {
    return this.db.selectFrom('repositories').selectAll('repositories').where('id', '=', id).executeTakeFirstOrThrow();
  }

  getAll() {
    return this.db.selectFrom('repositories').selectAll('repositories').execute();
  }

  async delete(id: string) {
    await this.db.deleteFrom('repositoryLocalMetrics').where('id', '=', id).execute();
    await this.db.deleteFrom('repositoryPaths').where('id', '=', id).execute();
    await this.db.deleteFrom('repositorySchedules').where('repository', '=', id).execute();
    await this.db.deleteFrom('runHistory').where('repositoryId', '=', id).execute();
    await this.db.deleteFrom('repositories').where('id', '=', id).execute();
  }
}
