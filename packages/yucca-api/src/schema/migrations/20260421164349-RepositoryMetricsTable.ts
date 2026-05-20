import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "repositoryMetrics" (
  "id" uuid NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "lastBackup" timestamp with time zone,
  "lastSuccessfulBackup" timestamp with time zone,
  "lastBackupDuration" integer,
  CONSTRAINT "repositoryMetrics_id_fkey" FOREIGN KEY ("id") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "repositoryMetrics_pkey" PRIMARY KEY ("id")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "repositoryMetrics";`.execute(db);
}
