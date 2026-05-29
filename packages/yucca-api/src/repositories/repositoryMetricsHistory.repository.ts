import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { RepositoryMetricsHistoryTable } from 'src/schema/tables/repositoryMetricsHistory.table';
import { toCursorPage } from 'src/utils/pagination';

@Injectable()
export class RepositoryMetricsHistoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(entry: Insertable<RepositoryMetricsHistoryTable>) {
    return this.db.insertInto('repositoryMetricsHistory').values(entry).returningAll().executeTakeFirstOrThrow();
  }

  async list({ repositoryId, cursor, limit }: { repositoryId: string; cursor?: string; limit: number }) {
    const rows = await this.db
      .selectFrom('repositoryMetricsHistory')
      .selectAll('repositoryMetricsHistory')
      .where('repositoryId', '=', repositoryId)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .$if(cursor !== undefined, (qb) => qb.where('createdAt', '<', new Date(cursor!)))
      .execute();

    return toCursorPage(rows, limit, (row) => row.createdAt.toISOString());
  }
}
