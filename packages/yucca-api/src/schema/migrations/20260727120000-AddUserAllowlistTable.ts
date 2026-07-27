import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "userAllowlist" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" character varying NOT NULL,
  "inviteCode" character varying NOT NULL,
  "invited" boolean NOT NULL DEFAULT false,
  "inviteUsed" boolean NOT NULL DEFAULT false,
  "inviteUsedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "userAllowlist_email_uq" UNIQUE ("email"),
  CONSTRAINT "userAllowlist_inviteCode_uq" UNIQUE ("inviteCode"),
  CONSTRAINT "userAllowlist_pkey" PRIMARY KEY ("id")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "userAllowlist";`.execute(db);
}
