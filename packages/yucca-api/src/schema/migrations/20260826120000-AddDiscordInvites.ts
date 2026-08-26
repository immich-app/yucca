import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "discordInviteBatches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "guildId" character varying NOT NULL,
  "channelId" character varying NOT NULL,
  "messageId" character varying,
  "maxClaims" integer NOT NULL,
  "createdByDiscordUserId" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "discordInviteBatches_pkey" PRIMARY KEY ("id")
);`.execute(db);

  await sql`ALTER TABLE "userAllowlist" ALTER COLUMN "email" DROP NOT NULL;`.execute(db);
  await sql`ALTER TABLE "userAllowlist" ADD "discordUserId" character varying;`.execute(db);
  await sql`ALTER TABLE "userAllowlist" ADD "batchId" uuid;`.execute(db);
  await sql`ALTER TABLE "userAllowlist" ADD CONSTRAINT "userAllowlist_discordUserId_uq" UNIQUE ("discordUserId");`.execute(
    db,
  );
  await sql`ALTER TABLE "userAllowlist" ADD CONSTRAINT "userAllowlist_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "discordInviteBatches" ("id") ON UPDATE CASCADE ON DELETE SET NULL;`.execute(
    db,
  );

  await sql`ALTER TABLE "discordLinkRequests" ADD "allowlistId" uuid;`.execute(db);
  await sql`ALTER TABLE "discordLinkRequests" ADD CONSTRAINT "discordLinkRequests_allowlistId_fkey" FOREIGN KEY ("allowlistId") REFERENCES "userAllowlist" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "discordLinkRequests" DROP CONSTRAINT "discordLinkRequests_allowlistId_fkey";`.execute(db);
  await sql`ALTER TABLE "discordLinkRequests" DROP COLUMN "allowlistId";`.execute(db);
  await sql`ALTER TABLE "userAllowlist" DROP CONSTRAINT "userAllowlist_batchId_fkey";`.execute(db);
  await sql`ALTER TABLE "userAllowlist" DROP CONSTRAINT "userAllowlist_discordUserId_uq";`.execute(db);
  await sql`ALTER TABLE "userAllowlist" DROP COLUMN "batchId";`.execute(db);
  await sql`ALTER TABLE "userAllowlist" DROP COLUMN "discordUserId";`.execute(db);
  await sql`DELETE FROM "userAllowlist" WHERE "email" IS NULL;`.execute(db);
  await sql`ALTER TABLE "userAllowlist" ALTER COLUMN "email" SET NOT NULL;`.execute(db);
  await sql`DROP TABLE "discordInviteBatches";`.execute(db);
}
