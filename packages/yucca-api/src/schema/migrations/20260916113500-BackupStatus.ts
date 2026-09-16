import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE "backup_status_enum" AS ENUM ('incomplete','complete','warn','failed');`.execute(db);
  await sql`ALTER TABLE "repositoryMetrics" ADD "lastBackupStatus" backup_status_enum;`.execute(db);
  await sql`ALTER TABLE "repositoryMetricsHistory" ADD "backupStatus" backup_status_enum;`.execute(db);
  await sql`
    UPDATE "repositoryMetrics"
    SET "lastBackupStatus" = CASE
      WHEN "lastStarted" IS NOT NULL AND ("lastBackup" IS NULL OR "lastStarted" > "lastBackup") THEN 'incomplete'::backup_status_enum
      WHEN "lastBackup" IS NULL THEN NULL
      WHEN "lastSuccessfulBackup" = "lastBackup" THEN 'complete'::backup_status_enum
      ELSE 'failed'::backup_status_enum
    END
  `.execute(db);
  await sql`
    UPDATE "repositoryMetricsHistory"
    SET "backupStatus" = CASE
      WHEN "started" IS NOT NULL AND ("backup" IS NULL OR "started" > "backup") THEN 'incomplete'::backup_status_enum
      WHEN "backup" IS NULL THEN NULL
      WHEN "successfulBackup" = "backup" THEN 'complete'::backup_status_enum
      ELSE 'failed'::backup_status_enum
    END
  `.execute(db);
  await sql`ALTER TABLE "repositoryMetrics" DROP COLUMN "lastSuccessfulBackup";`.execute(db);
  await sql`ALTER TABLE "repositoryMetricsHistory" DROP COLUMN "successfulBackup";`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositoryMetrics" ADD "lastSuccessfulBackup" timestamp with time zone;`.execute(db);
  await sql`ALTER TABLE "repositoryMetricsHistory" ADD "successfulBackup" timestamp with time zone;`.execute(db);
  await sql`
    UPDATE "repositoryMetrics"
    SET "lastSuccessfulBackup" = "lastBackup"
    WHERE "lastBackupStatus" IN ('complete', 'warn')
  `.execute(db);
  await sql`
    UPDATE "repositoryMetricsHistory"
    SET "successfulBackup" = "backup"
    WHERE "backupStatus" IN ('complete', 'warn')
  `.execute(db);
  await sql`ALTER TABLE "repositoryMetrics" DROP COLUMN "lastBackupStatus";`.execute(db);
  await sql`ALTER TABLE "repositoryMetricsHistory" DROP COLUMN "backupStatus";`.execute(db);
  await sql`DROP TYPE "backup_status_enum";`.execute(db);
}
