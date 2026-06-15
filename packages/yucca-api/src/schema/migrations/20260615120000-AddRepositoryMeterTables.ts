import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "repositoryMeter" (
  "repositoryId" uuid NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "objectCount" bigint NOT NULL,
  "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "repositoryMeter_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "repositoryMeter_pkey" PRIMARY KEY ("repositoryId")
);`.execute(db);

  await sql`CREATE TABLE "repositoryMeterHistory" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "repositoryId" uuid NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "objectCount" bigint NOT NULL,
  "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "repositoryMeterHistory_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "repositoryMeterHistory_pkey" PRIMARY KEY ("id")
);`.execute(db);

  await sql`CREATE INDEX "repositoryMeterHistory_repositoryId_idx" ON "repositoryMeterHistory" ("repositoryId");`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "repositoryMeterHistory";`.execute(db);
  await sql`DROP TABLE "repositoryMeter";`.execute(db);
}
