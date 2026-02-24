import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { RepositoryLocalMetricsTable } from '../schema/tables/repositoryLocalMetrics.table';

@Injectable()
export class RepositoryLocalMetricsRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async save(id: string, metrics: Pick<RepositoryLocalMetricsTable, 'lastBackup' | 'sizeBytes'>) {
    await this.db
      .insertInto('repositoryLocalMetrics')
      .values({
        id,
        ...metrics,
      })
      .onConflict((oc) => oc.doUpdateSet(metrics))
      .executeTakeFirstOrThrow();
  }

  getAll() {
    return this.db.selectFrom('repositoryLocalMetrics').selectAll('repositoryLocalMetrics').execute();
  }
}
