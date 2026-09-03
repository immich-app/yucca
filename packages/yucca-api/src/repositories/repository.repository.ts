import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, Updateable } from 'kysely';
import { jsonBuildObject } from 'kysely/helpers/postgres';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { AuditLogTable } from 'src/schema/tables/auditLog.table';
import { RepositoryTable } from 'src/schema/tables/repository.table';

export const metricsJson = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMetrics'>) =>
  jsonBuildObject({
    sizeBytes: eb.fn.coalesce('repositoryMetrics.sizeBytes', eb.val(0)),
    lastBackup: eb.ref('repositoryMetrics.lastBackup'),
    lastSuccessfulBackup: eb.ref('repositoryMetrics.lastSuccessfulBackup'),
    lastBackupDuration: eb.ref('repositoryMetrics.lastBackupDuration'),
  }).as('metrics');

export const meterJson = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMeter'>) =>
  jsonBuildObject({
    sizeBytes: eb.fn.coalesce('repositoryMeter.sizeBytes', eb.val(0)),
    objectCount: eb.fn.coalesce('repositoryMeter.objectCount', eb.val(0)),
    lastUpdated: eb.ref('repositoryMeter.timestamp'),
  }).as('meter');

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
      .innerJoin('connections', 'connections.id', 'repositories.connectionId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .leftJoin('repositoryMeter', 'repositoryMeter.repositoryId', 'repositories.id')
      .where('repositories.id', '=', id)
      .selectAll('repositories')
      .select('connections.type as connectionType')
      .select(metricsJson)
      .select(meterJson)
      .executeTakeFirstOrThrow();
  }

  getByUser(userId: string) {
    return this.db
      .selectFrom('repositories')
      .innerJoin('connections', 'connections.id', 'repositories.connectionId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .leftJoin('repositoryMeter', 'repositoryMeter.repositoryId', 'repositories.id')
      .where('repositories.userId', '=', userId)
      .selectAll('repositories')
      .select('connections.type as connectionType')
      .select(metricsJson)
      .select(meterJson)
      .execute();
  }

  async update(id: string, repository: Updateable<RepositoryTable>) {
    await this.db.updateTable('repositories').where('id', '=', id).set(repository).execute();
    return this.get(id);
  }

  async disableWorm(id: string, audit: Insertable<AuditLogTable>) {
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('repositories').where('id', '=', id).set({ worm: false }).execute();
      await trx.insertInto('auditLog').values(audit).execute();
    });
  }

  async delete(id: string, audit: Insertable<AuditLogTable>) {
    await this.db.transaction().execute(async (trx) => {
      await trx.insertInto('auditLog').values(audit).execute();
      await trx.deleteFrom('repositories').where('id', '=', id).execute();
    });
  }

  getByIds(ids: string[]) {
    return this.db.selectFrom('repositories').selectAll().where('id', 'in', ids).execute();
  }

  async reparent(ids: string[], connectionId: string) {
    await this.db.updateTable('repositories').set({ connectionId }).where('id', 'in', ids).execute();
  }
}
