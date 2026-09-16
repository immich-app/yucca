import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { AuditLogTable } from 'src/schema/tables/auditLog.table';
import { RepositoryTable } from 'src/schema/tables/repository.table';

type RepositoryMetricsRow = {
  metricsSizeBytes: string | number;
  lastBackup?: Date;
  lastSuccessfulBackup?: Date;
  lastBackupDuration?: number;
};

type RepositoryMeterRow = {
  meterSizeBytes: string | number;
  meterObjectCount: string | number;
  meterLastUpdated?: Date;
};

export const metricsColumns = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMetrics'>) => [
  eb.fn.coalesce('repositoryMetrics.sizeBytes', eb.val(0)).as('metricsSizeBytes'),
  eb.ref('repositoryMetrics.lastBackup').as('lastBackup'),
  eb.ref('repositoryMetrics.lastSuccessfulBackup').as('lastSuccessfulBackup'),
  eb.ref('repositoryMetrics.lastBackupDuration').as('lastBackupDuration'),
];

export const meterColumns = (eb: ExpressionBuilder<DB, 'repositories' | 'repositoryMeter'>) => [
  eb.fn.coalesce('repositoryMeter.sizeBytes', eb.val(0)).as('meterSizeBytes'),
  eb.fn.coalesce('repositoryMeter.objectCount', eb.val(0)).as('meterObjectCount'),
  eb.ref('repositoryMeter.timestamp').as('meterLastUpdated'),
];

export const withMetricsAndMeter = <T extends RepositoryMetricsRow & RepositoryMeterRow>({
  metricsSizeBytes,
  lastBackup,
  lastSuccessfulBackup,
  lastBackupDuration,
  meterSizeBytes,
  meterObjectCount,
  meterLastUpdated,
  ...row
}: T) => ({
  ...row,
  metrics: {
    sizeBytes: Number(metricsSizeBytes),
    lastBackup: lastBackup ?? null,
    lastSuccessfulBackup: lastSuccessfulBackup ?? null,
    lastBackupDuration,
  },
  meter: {
    sizeBytes: Number(meterSizeBytes),
    objectCount: Number(meterObjectCount),
    lastUpdated: meterLastUpdated ?? null,
  },
});

@Injectable()
export class RepositoryRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async create(repository: Insertable<RepositoryTable>) {
    const row = await this.db.insertInto('repositories').values(repository).returningAll().executeTakeFirstOrThrow();
    return this.get(row.id);
  }

  async get(id: string) {
    const row = await this.db
      .selectFrom('repositories')
      .innerJoin('connections', 'connections.id', 'repositories.connectionId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .leftJoin('repositoryMeter', 'repositoryMeter.repositoryId', 'repositories.id')
      .where('repositories.id', '=', id)
      .selectAll('repositories')
      .select('connections.type as connectionType')
      .select(metricsColumns)
      .select(meterColumns)
      .executeTakeFirstOrThrow();

    return withMetricsAndMeter(row);
  }

  async getByUser(userId: string) {
    const rows = await this.db
      .selectFrom('repositories')
      .innerJoin('connections', 'connections.id', 'repositories.connectionId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .leftJoin('repositoryMeter', 'repositoryMeter.repositoryId', 'repositories.id')
      .where('repositories.userId', '=', userId)
      .selectAll('repositories')
      .select('connections.type as connectionType')
      .select(metricsColumns)
      .select(meterColumns)
      .execute();

    return rows.map((row) => withMetricsAndMeter(row));
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
