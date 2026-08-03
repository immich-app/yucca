import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "users" ADD "createdAt" timestamp with time zone NOT NULL DEFAULT now();`.execute(db);
  await sql`UPDATE "users" SET "createdAt" = '2026-01-01T00:00:00Z';`.execute(db);

  await sql`CREATE TABLE "userFeatureFlagOverride" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "flag" character varying NOT NULL,
  "value" boolean NOT NULL,
  "setBy" character varying NOT NULL,
  "reason" character varying,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "userFeatureFlagOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "userFeatureFlagOverride_userId_flag_uq" UNIQUE ("userId", "flag"),
  CONSTRAINT "userFeatureFlagOverride_pkey" PRIMARY KEY ("id")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "userFeatureFlagOverride";`.execute(db);
  await sql`ALTER TABLE "users" DROP COLUMN "createdAt";`.execute(db);
}
