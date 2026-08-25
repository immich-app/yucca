import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "discordLinks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "discordUserId" character varying NOT NULL,
  "discordUsername" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "discordLinks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "discordLinks_userId_uq" UNIQUE ("userId"),
  CONSTRAINT "discordLinks_discordUserId_uq" UNIQUE ("discordUserId"),
  CONSTRAINT "discordLinks_pkey" PRIMARY KEY ("id")
);`.execute(db);

  await sql`CREATE TABLE "discordLinkRequests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" character varying NOT NULL,
  "discordUserId" character varying NOT NULL,
  "discordUsername" character varying NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "discordLinkRequests_code_uq" UNIQUE ("code"),
  CONSTRAINT "discordLinkRequests_pkey" PRIMARY KEY ("id")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "discordLinkRequests";`.execute(db);
  await sql`DROP TABLE "discordLinks";`.execute(db);
}
