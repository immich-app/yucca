import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "userAllowlist" ADD "inviteEmailSentAt" timestamp with time zone;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "userAllowlist" DROP COLUMN "inviteEmailSentAt";`.execute(db);
}
