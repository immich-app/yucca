import { Injectable } from '@nestjs/common';
import { Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { RepositoryMetricsDto } from '../dto/repository.dto';
import { DB } from '../schema';
import { RepositoryLocalMetricsTable } from '../schema/tables/repositoryLocalMetrics.table';

@Injectable()
export class RepositoryLocalMetricsRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async save(id: string, metrics: Updateable<RepositoryLocalMetricsTable>) {
    return await this.db
      .insertInto('repositoryLocalMetrics')
      .values({
        id,
        sizeBytes: 0,
        ...metrics,
      })
      .onConflict((oc) => oc.doUpdateSet(metrics))
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async get(id: string): Promise<RepositoryMetricsDto> {
    return (
      (await this.db
        .selectFrom('repositoryLocalMetrics')
        .selectAll('repositoryLocalMetrics')
        .where('id', '=', id)
        .executeTakeFirst()) ?? {
        sizeBytes: 0,
      }
    );
  }

  getAll() {
    return this.db.selectFrom('repositoryLocalMetrics').selectAll('repositoryLocalMetrics').execute();
  }
}
