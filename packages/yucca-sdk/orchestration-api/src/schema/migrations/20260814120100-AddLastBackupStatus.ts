import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('repositoryLocalMetrics')
    .addColumn('lastBackupStatus', 'text', (col) =>
      col.check(sql`"lastBackupStatus" IS NULL OR "lastBackupStatus" IN ('complete', 'warn', 'failed')`),
    )
    .execute();

  await sql`
    UPDATE "repositoryLocalMetrics"
    SET "lastBackupStatus" = CASE
      WHEN "lastBackup" IS NULL THEN NULL
      WHEN "lastSuccessfulBackup" = "lastBackup" THEN 'complete'
      ELSE 'failed'
    END
  `.execute(db);

  await db.schema.alterTable('repositoryLocalMetrics').dropColumn('lastSuccessfulBackup').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositoryLocalMetrics').addColumn('lastSuccessfulBackup', 'datetime').execute();

  await sql`
    UPDATE "repositoryLocalMetrics"
    SET "lastSuccessfulBackup" = "lastBackup"
    WHERE "lastBackupStatus" IN ('complete', 'warn')
  `.execute(db);

  await db.schema.alterTable('repositoryLocalMetrics').dropColumn('lastBackupStatus').execute();
}
