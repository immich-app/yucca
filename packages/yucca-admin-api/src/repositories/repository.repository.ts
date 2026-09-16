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

type RepositoryMetricsRow = {
  metricsSizeBytes: string | number;
  lastStarted?: Date;
  lastBackup?: Date;
  lastSuccessfulBackup?: Date;
  lastBackupDuration?: number;
};

const metricsColumns = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMetrics'>) => [
  eb.fn.coalesce('repositoryMetrics.sizeBytes', eb.val(0)).as('metricsSizeBytes'),
  eb.ref('repositoryMetrics.lastStarted').as('lastStarted'),
  eb.ref('repositoryMetrics.lastBackup').as('lastBackup'),
  eb.ref('repositoryMetrics.lastSuccessfulBackup').as('lastSuccessfulBackup'),
  eb.ref('repositoryMetrics.lastBackupDuration').as('lastBackupDuration'),
];

const withMetrics = <T extends RepositoryMetricsRow>({
  metricsSizeBytes,
  lastStarted,
  lastBackup,
  lastSuccessfulBackup,
  lastBackupDuration,
  ...row
}: T) => ({
  ...row,
  metrics: {
    sizeBytes: Number(metricsSizeBytes),
    lastStarted: lastStarted ?? null,
    lastBackup: lastBackup ?? null,
    lastSuccessfulBackup: lastSuccessfulBackup ?? null,
    lastBackupDuration: lastBackupDuration ?? null,
  },
});

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
      .select(metricsColumns)
      .orderBy('repositories.id', 'asc')
      .limit(limit + 1)
      .$if(cursor !== undefined, (qb) => qb.where('repositories.id', '>', cursor!))
      .$if(userId !== undefined, (qb) => qb.where('repositories.userId', '=', userId!))
      .execute();

    return toCursorPage(
      rows.map((row) => withMetrics(row)),
      limit,
    );
  }

  async get(id: string) {
    const row = await this.db
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
      .select(metricsColumns)
      .executeTakeFirstOrThrow();

    return withMetrics(row);
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
