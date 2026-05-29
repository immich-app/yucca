import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "repositoryMetricsHistory" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "repositoryId" uuid NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "sizeBytes" bigint,
  "started" timestamp with time zone,
  "backup" timestamp with time zone,
  "successfulBackup" timestamp with time zone,
  "backupDuration" integer,
  CONSTRAINT "repositoryMetricsHistory_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "repositoryMetricsHistory_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "repositoryMetricsHistory_repositoryId_idx" ON "repositoryMetricsHistory" ("repositoryId");`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "repositoryMetricsHistory";`.execute(db);
}
