import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, Updateable } from 'kysely';
import { jsonBuildObject } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { RepositoryTable } from 'src/schema/tables/repository.table';
import { toCursorPage } from 'src/utils/pagination';

const ownerJson = (eb: ExpressionBuilder<DB, 'repositories' | 'users'>) =>
  jsonBuildObject({
    id: eb.ref('users.id'),
    name: eb.ref('users.name'),
    email: eb.ref('users.email'),
    disabled: eb.ref('users.disabled'),
  }).as('user');

const metricsJson = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMetrics'>) =>
  jsonBuildObject({
    sizeBytes: eb.fn.coalesce('repositoryMetrics.sizeBytes', eb.val(0)),
    lastStarted: eb.ref('repositoryMetrics.lastStarted'),
    lastBackup: eb.ref('repositoryMetrics.lastBackup'),
    lastSuccessfulBackup: eb.ref('repositoryMetrics.lastSuccessfulBackup'),
    lastBackupDuration: eb.ref('repositoryMetrics.lastBackupDuration'),
  }).as('metrics');

@Injectable()
export class RepositoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async list({ cursor, limit, userId }: { cursor?: string; limit: number; userId?: string }) {
    const rows = await this.db
      .selectFrom('repositories')
      .innerJoin('users', 'users.id', 'repositories.userId')
      .innerJoin('connections', 'connections.id', 'repositories.connectionId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .select([
        'repositories.id',
        'repositories.name',
        'repositories.worm',
        'repositories.siteCode',
        'repositories.storageClusterCode',
        'repositories.connectionId',
        'connections.type as connectionType',
      ])
      .select(ownerJson)
      .select(metricsJson)
      .orderBy('repositories.id', 'asc')
      .limit(limit + 1)
      .$if(cursor !== undefined, (qb) => qb.where('repositories.id', '>', cursor!))
      .$if(userId !== undefined, (qb) => qb.where('repositories.userId', '=', userId!))
      .execute();

    return toCursorPage(rows, limit);
  }

  get(id: string) {
    return this.db
      .selectFrom('repositories')
      .innerJoin('users', 'users.id', 'repositories.userId')
      .innerJoin('connections', 'connections.id', 'repositories.connectionId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .where('repositories.id', '=', id)
      .select([
        'repositories.id',
        'repositories.name',
        'repositories.worm',
        'repositories.siteCode',
        'repositories.storageClusterCode',
        'repositories.connectionId',
        'connections.type as connectionType',
      ])
      .select(ownerJson)
      .select(metricsJson)
      .executeTakeFirstOrThrow();
  }

  async create(repository: Insertable<RepositoryTable>) {
    const row = await this.db.insertInto('repositories').values(repository).returning('id').executeTakeFirstOrThrow();
    return this.get(row.id);
  }

  async update(id: string, repository: Updateable<RepositoryTable>) {
    await this.db.updateTable('repositories').where('id', '=', id).set(repository).execute();
    return this.get(id);
  }

  async delete(id: string) {
    await this.db.deleteFrom('repositories').where('id', '=', id).execute();
  }
}
