import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "discordInviteBatches" ADD "cancelledAt" timestamp with time zone;`.execute(db);
  await sql`ALTER TABLE "userAllowlist" ADD "discordUsername" character varying;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "userAllowlist" DROP COLUMN "discordUsername";`.execute(db);
  await sql`ALTER TABLE "discordInviteBatches" DROP COLUMN "cancelledAt";`.execute(db);
}
