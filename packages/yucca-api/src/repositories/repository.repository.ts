import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, Updateable } from 'kysely';
import { jsonBuildObject } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { RepositoryTable } from 'src/schema/tables/repository.table';

const metricsJson = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMetrics'>) =>
  jsonBuildObject({
    sizeBytes: eb.fn.coalesce('repositoryMetrics.sizeBytes', eb.val(0)),
    lastBackup: eb.ref('repositoryMetrics.lastBackup'),
    lastSuccessfulBackup: eb.ref('repositoryMetrics.lastSuccessfulBackup'),
    lastBackupDuration: eb.ref('repositoryMetrics.lastBackupDuration'),
  }).as('metrics');

@Injectable()
export class RepositoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async create(repository: Insertable<RepositoryTable>) {
    const row = await this.db.insertInto('repositories').values(repository).returningAll().executeTakeFirstOrThrow();
    return this.get(row.id);
  }

  get(id: string) {
    return this.db
      .selectFrom('repositories')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .where('repositories.id', '=', id)
      .selectAll('repositories')
      .select(metricsJson)
      .executeTakeFirstOrThrow();
  }

  getByUser(userId: string) {
    return this.db
      .selectFrom('repositories')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .where('userId', '=', userId)
      .selectAll('repositories')
      .select(metricsJson)
      .execute();
  }

  async update(id: string, repository: Updateable<RepositoryTable>) {
    await this.db.updateTable('repositories').where('id', '=', id).set(repository).execute();
    return this.get(id);
  }
}
