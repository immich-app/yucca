import { Injectable } from '@nestjs/common';
import { Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { RepositoryTable } from '../schema/tables/repository.table';
import { RetentionPolicy } from '../utils/restic';

type RepositoryRow = {
  id: string;
  remoteId: string;
  backendId: string;
  retentionPolicy: RetentionPolicy | null;
};

@Injectable()
export class RepositoryRepository {
  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  async create(repository: RepositoryRow) {
    await this.db
      .insertInto('repositories')
      .values({
        id: repository.id,
        remoteId: repository.remoteId,
        backendId: repository.backendId,
        retentionPolicy: repository.retentionPolicy === null ? null : JSON.stringify(repository.retentionPolicy),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return repository;
  }

  async update(id: string, patch: Partial<Omit<RepositoryRow, 'id'>>) {
    const { retentionPolicy, ...rest } = patch;
    const set: Updateable<RepositoryTable> = { ...rest };
    if ('retentionPolicy' in patch) {
      set.retentionPolicy = retentionPolicy === null ? null : JSON.stringify(retentionPolicy);
    }

    await this.db.updateTable('repositories').set(set).where('id', '=', id).execute();
  }

  async get(id: string): Promise<RepositoryRow | undefined> {
    const row = await this.db
      .selectFrom('repositories')
      .selectAll('repositories')
      .where('id', '=', id)
      .executeTakeFirst();

    if (row) {
      return {
        id: row.id,
        remoteId: row.remoteId,
        backendId: row.backendId,
        retentionPolicy: row.retentionPolicy === null ? null : (JSON.parse(row.retentionPolicy) as RetentionPolicy),
      };
    }
  }

  async getAll(): Promise<RepositoryRow[]> {
    const rows = await this.db.selectFrom('repositories').selectAll('repositories').execute();
    return rows.map((row) => ({
      id: row.id,
      remoteId: row.remoteId,
      backendId: row.backendId,
      retentionPolicy: row.retentionPolicy === null ? null : (JSON.parse(row.retentionPolicy) as RetentionPolicy),
    }));
  }

  async delete(id: string) {
    await this.db.deleteFrom('repositoryLocalMetrics').where('id', '=', id).execute();
    await this.db.deleteFrom('repositoryPaths').where('id', '=', id).execute();
    await this.db.deleteFrom('repositorySchedules').where('repository', '=', id).execute();
    await this.db.deleteFrom('runHistory').where('repositoryId', '=', id).execute();
    await this.db.deleteFrom('repositories').where('id', '=', id).execute();
  }
}
