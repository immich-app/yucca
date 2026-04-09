import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositoryLocalMetrics').addColumn('lastSuccessfulBackup', 'datetime').execute();

  await db.schema.alterTable('repositoryLocalMetrics').addColumn('lastBackupDuration', 'integer').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositoryLocalMetrics').dropColumn('lastSuccessfulBackup').execute();

  await db.schema.alterTable('repositoryLocalMetrics').dropColumn('lastBackupDuration').execute();
}
