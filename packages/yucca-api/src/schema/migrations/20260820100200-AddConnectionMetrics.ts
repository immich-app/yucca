import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "connectionMetrics" (
  "connectionId" uuid NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "objectCount" bigint NOT NULL,
  "billableBytes" bigint NOT NULL,
  "repositoryCount" integer NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "connectionMetrics_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "connectionMetrics_pkey" PRIMARY KEY ("connectionId")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "connectionMetrics";`.execute(db);
}
